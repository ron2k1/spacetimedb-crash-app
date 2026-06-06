//! Crash marketplace + live-auction backend, as a SpacetimeDB module.
//!
//! This replaces `marketplace-server/`'s hand-rolled Express + `ws` + JSON-file
//! stack (`src/store.ts`) with the database itself. Tables ARE the shared state;
//! reducers ARE the write API; subscriptions ARE the realtime layer.
//!
//! Target: SpacetimeDB 1.3 module API (the `spacetimedb = "1.3.0"` crate, which
//! resolves to the 1.x line -- v1.12.0 at build time). The macro spelling here
//! (`name = ...`, `ctx.sender` / `ctx.timestamp` as fields) matches the
//! `spacetime init`-generated scaffold this file replaces and COMPILES CLEANLY
//! against the pinned crate (verified: `cargo build` -> wasm32 artifact). The
//! current web docs are a 2.0 snapshot that uses `accessor =` / `ctx.sender()`;
//! see the deviations note. Do NOT adopt the 2.0 spelling without re-pinning.

use spacetimedb::{
    table, reducer, ReducerContext, Table, Identity, Timestamp, ScheduleAt,
};
use std::time::Duration;

// ---------------------------------------------------------------------------
// Tables -- the entire shared, client-visible state. Ported from
// marketplace-server/src/types.ts. All marked `public` so the Tauri renderer
// and headless agents can subscribe. `price_minor` etc. are USDC minor units
// (6 decimals), matching the x402 ledger -- no float ever crosses the boundary.
// ---------------------------------------------------------------------------

/// An item for sale: agent | skill | workflow | tool.
#[table(name = listing, public)]
pub struct Listing {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub name: String,
    pub blurb: String,
    /// "agent" | "skill" | "workflow" | "tool".
    pub category: String,
    /// USDC minor units, matches the x402 ledger.
    pub price_minor: u64,
    /// Who listed it (human or agent) -- ctx.sender at create time.
    pub seller_identity: Identity,
    pub seller_name: String,
    pub seller_is_agent: bool,
    pub tags: Vec<String>,
    pub created_at: Timestamp,
    pub acquired_count: u32,
}

/// A live auction over a listing.
#[table(name = auction, public)]
pub struct Auction {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    /// Non-unique index: settle_auction & clients look auctions up by listing.
    #[index(btree)]
    pub listing_id: u64,
    /// Current high bid (0 = no bids yet).
    pub high_bid_minor: u64,
    pub high_bidder: Option<Identity>,
    pub min_increment_minor: u64,
    /// When settle_auction fires.
    pub ends_at: Timestamp,
    /// "open" | "settled".
    pub status: String,
}

/// One bid -- append-only ledger of the room.
#[table(name = bid, public)]
pub struct Bid {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    /// Non-unique index so a client can pull every bid for an auction.
    #[index(btree)]
    pub auction_id: u64,
    pub bidder: Identity,
    pub amount_minor: u64,
    pub at: Timestamp,
}

/// A settled (or settling) sale.
///
/// NOTE: the design spec names this `order`, but `ORDER` is a SQL reserved word
/// (SpacetimeDB SQL would require quoting it as `"Order"` in every subscription).
/// We name the Rust struct + table `sale` to sidestep the keyword entirely. The
/// reducer arg `sale_id` and the engine's subscription target change accordingly
/// (`SELECT * FROM sale WHERE payment_status = 'awaiting_payment'`).
#[table(name = sale, public)]
pub struct Sale {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub listing_id: u64,
    pub buyer: Identity,
    pub price_minor: u64,
    /// "awaiting_payment" | "settled" | "failed".
    /// Indexed: the engine subscribes to `payment_status = 'awaiting_payment'`.
    #[index(btree)]
    pub payment_status: String,
    /// On-chain reference once record_payment writes it.
    pub tx_ref: Option<String>,
    pub at: Timestamp,
}

/// A registered agent participant (so agents are first-class in the catalog).
#[table(name = agent, public)]
pub struct Agent {
    #[primary_key]
    pub identity: Identity,
    pub name: String,
    pub blurb: String,
}

/// The shared, capped activity feed every client renders.
#[table(name = activity, public)]
pub struct Activity {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    /// "listed" | "bid" | "acquired" | "won" | "paid".
    pub kind: String,
    pub listing_id: u64,
    pub actor: Identity,
    pub actor_name: String,
    pub at: Timestamp,
}

/// Scheduled table that arms `settle_auction`. SpacetimeDB invokes the bound
/// reducer for each row when its `scheduled_at` is due. Private (no `public`):
/// it is a server-side timer, not client state. We carry the `auction_id` as
/// payload so the fired reducer knows which auction to settle.
#[table(name = settle_schedule, scheduled(settle_auction))]
pub struct SettleSchedule {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub auction_id: u64,
    pub scheduled_at: ScheduleAt,
}

/// Private allowlist of identities permitted to finalize payment outcomes via
/// `record_payment`. NOT public: clients cannot read or subscribe to it. The
/// engine's x402 bridge claims this role once at startup (`claim_payment_bridge`);
/// thereafter only that identity may finalize a payment, so a random client cannot
/// forge a "paid" sale. DEMO-GRADE trust-on-first-use: on a fresh database the
/// engine connects and claims before anyone else; a hardened deployment would pin
/// the bridge identity at publish time rather than first-come.
#[table(name = payment_bridge)]
pub struct PaymentBridge {
    #[primary_key]
    pub identity: Identity,
}

// ---------------------------------------------------------------------------
// Activity feed cap. store.ts bounded the feed to 200; we mirror that so the
// table does not grow without limit. Trimmed on every append.
// ---------------------------------------------------------------------------
const ACTIVITY_CAP: u64 = 200;

/// Append an activity row, then trim the feed to the most recent ACTIVITY_CAP
/// rows by deleting the lowest auto-inc ids (auto-inc id is monotonic, so the
/// smallest ids are the oldest events).
fn push_activity(
    ctx: &ReducerContext,
    kind: &str,
    listing_id: u64,
    actor: Identity,
    actor_name: String,
) {
    ctx.db.activity().insert(Activity {
        id: 0,
        kind: kind.to_string(),
        listing_id,
        actor,
        actor_name,
        at: ctx.timestamp,
    });

    let count = ctx.db.activity().count();
    if count > ACTIVITY_CAP {
        let overflow = (count - ACTIVITY_CAP) as usize;
        // Auto-inc ids are monotonic, so the smallest ids are the oldest events.
        // Bound the work to the `overflow` oldest rows (steady-state overflow is 1)
        // rather than sorting+scanning the whole feed on every append.
        let mut ids: Vec<u64> = ctx.db.activity().iter().map(|a| a.id).collect();
        ids.sort_unstable();
        ids.truncate(overflow);
        for id in ids {
            ctx.db.activity().id().delete(&id);
        }
    }
}

/// Resolve a caller's display name + agent flag from the `agent` registry.
/// A registered agent shows its advertised name; everyone else is "You"
/// (mirrors store.ts DEFAULT_SELLER) and is treated as human.
fn actor_profile(ctx: &ReducerContext, who: Identity) -> (String, bool) {
    match ctx.db.agent().identity().find(&who) {
        Some(agent) => (agent.name, true),
        None => ("You".to_string(), false),
    }
}

// ---------------------------------------------------------------------------
// Lifecycle reducers. Kept minimal -- the catalog is seeded by clients calling
// create_listing (or the TS seed during migration), not hard-coded here.
// ---------------------------------------------------------------------------

#[reducer(init)]
pub fn init(_ctx: &ReducerContext) {
    log::info!("crash marketplace module initialized");
}

#[reducer(client_connected)]
pub fn identity_connected(ctx: &ReducerContext) {
    log::info!("client connected: {}", ctx.sender);
}

#[reducer(client_disconnected)]
pub fn identity_disconnected(ctx: &ReducerContext) {
    log::info!("client disconnected: {}", ctx.sender);
}

// ---------------------------------------------------------------------------
// Write API.
// ---------------------------------------------------------------------------

/// Create a listing. The seller is always `ctx.sender` (humans and agents are
/// the same kind of client); the seller's display name / agent flag come from
/// the agent registry. Records a "listed" activity event.
#[reducer]
pub fn create_listing(
    ctx: &ReducerContext,
    name: String,
    blurb: String,
    category: String,
    price_minor: u64,
    tags: Vec<String>,
) -> Result<(), String> {
    if name.is_empty() {
        return Err("listing name must not be empty".to_string());
    }
    if blurb.is_empty() {
        return Err("listing blurb must not be empty".to_string());
    }
    if !is_valid_category(&category) {
        return Err("category must be agent|skill|workflow|tool".to_string());
    }

    let seller = ctx.sender;
    let (seller_name, seller_is_agent) = actor_profile(ctx, seller);

    let listing = ctx.db.listing().insert(Listing {
        id: 0,
        name,
        blurb,
        category,
        price_minor,
        seller_identity: seller,
        seller_name: seller_name.clone(),
        seller_is_agent,
        tags,
        created_at: ctx.timestamp,
        acquired_count: 0,
    });

    push_activity(ctx, "listed", listing.id, seller, seller_name);
    Ok(())
}

/// Open an auction over an existing listing and arm its scheduled settlement.
/// `ends_at = now + duration_secs`; `settle_auction` is scheduled for exactly
/// that instant via a one-shot `ScheduleAt::Time` row.
#[reducer]
pub fn create_auction(
    ctx: &ReducerContext,
    listing_id: u64,
    start_minor: u64,
    min_increment_minor: u64,
    duration_secs: u64,
) -> Result<(), String> {
    if ctx.db.listing().id().find(&listing_id).is_none() {
        return Err("listing not found".to_string());
    }
    // One live auction per listing: refuse a second concurrent auction so two
    // settle_schedule rows cannot both create a sale for the same item.
    if ctx
        .db
        .auction()
        .listing_id()
        .filter(&listing_id)
        .any(|a| a.status == "open")
    {
        return Err("listing already has an open auction".to_string());
    }
    if min_increment_minor == 0 {
        return Err("min_increment_minor must be > 0".to_string());
    }
    if duration_secs == 0 {
        return Err("duration_secs must be > 0".to_string());
    }
    // Cap the auction length and add fallibly: a huge client-supplied duration
    // must yield a clean Err, never panic the reducer on Timestamp overflow
    // (Timestamp + Duration is an unwrap()-ing add under the hood).
    const MAX_AUCTION_SECS: u64 = 7 * 24 * 60 * 60; // 7 days
    if duration_secs > MAX_AUCTION_SECS {
        return Err("duration_secs exceeds maximum".to_string());
    }
    let ends_at = ctx
        .timestamp
        .checked_add_duration(Duration::from_secs(duration_secs))
        .ok_or_else(|| "auction end time overflows".to_string())?;

    let auction = ctx.db.auction().insert(Auction {
        id: 0,
        listing_id,
        high_bid_minor: start_minor,
        high_bidder: None,
        min_increment_minor,
        ends_at,
        status: "open".to_string(),
    });

    // Arm the server-side settlement clock. One-shot at `ends_at`: SpacetimeDB
    // auto-deletes a `ScheduleAt::Time` row after it fires once.
    ctx.db.settle_schedule().insert(SettleSchedule {
        id: 0,
        auction_id: auction.id,
        scheduled_at: ScheduleAt::Time(ends_at),
    });

    Ok(())
}

/// Place a bid on an open auction. Validates the auction is open, not past its
/// end time, and that the amount clears the current high bid plus the minimum
/// increment. Records the bid, advances the auction high-water mark, and appends
/// a "bid" activity event. All of it commits atomically or not at all.
#[reducer]
pub fn place_bid(
    ctx: &ReducerContext,
    auction_id: u64,
    amount_minor: u64,
) -> Result<(), String> {
    let mut auction = ctx
        .db
        .auction()
        .id()
        .find(&auction_id)
        .ok_or_else(|| "auction not found".to_string())?;

    if auction.status != "open" {
        return Err("auction is not open".to_string());
    }
    if ctx.timestamp >= auction.ends_at {
        return Err("auction has ended".to_string());
    }

    // First bid clears the start price; subsequent bids must beat high + increment.
    let required = if auction.high_bidder.is_some() {
        auction
            .high_bid_minor
            .saturating_add(auction.min_increment_minor)
    } else {
        auction.high_bid_minor
    };
    if amount_minor < required {
        return Err("bid below minimum required amount".to_string());
    }

    let bidder = ctx.sender;

    ctx.db.bid().insert(Bid {
        id: 0,
        auction_id,
        bidder,
        amount_minor,
        at: ctx.timestamp,
    });

    // Capture the listing id before moving the row into update().
    let listing_id = auction.listing_id;
    auction.high_bid_minor = amount_minor;
    auction.high_bidder = Some(bidder);
    ctx.db.auction().id().update(auction);

    let (actor_name, _) = actor_profile(ctx, bidder);
    push_activity(ctx, "bid", listing_id, bidder, actor_name);

    Ok(())
}

/// Buy a listing outright. Writes a Sale awaiting payment (the engine's x402
/// bridge picks it up off-DB), bumps the listing's acquired_count, and records
/// an "acquired" activity event. Price is snapshotted from the listing.
#[reducer]
pub fn buy_now(ctx: &ReducerContext, listing_id: u64) -> Result<(), String> {
    let mut listing = ctx
        .db
        .listing()
        .id()
        .find(&listing_id)
        .ok_or_else(|| "listing not found".to_string())?;

    let buyer = ctx.sender;

    ctx.db.sale().insert(Sale {
        id: 0,
        listing_id,
        buyer,
        price_minor: listing.price_minor,
        payment_status: "awaiting_payment".to_string(),
        tx_ref: None,
        at: ctx.timestamp,
    });

    listing.acquired_count = listing.acquired_count.saturating_add(1);
    ctx.db.listing().id().update(listing);

    let (actor_name, _) = actor_profile(ctx, buyer);
    push_activity(ctx, "acquired", listing_id, buyer, actor_name);

    Ok(())
}

/// Register (or update) the calling identity as a named agent participant.
/// Upsert keyed on `ctx.sender`: re-registering overwrites the prior name/blurb.
#[reducer]
pub fn register_agent(
    ctx: &ReducerContext,
    name: String,
    blurb: String,
) -> Result<(), String> {
    if name.is_empty() {
        return Err("agent name must not be empty".to_string());
    }
    let identity = ctx.sender;

    if ctx.db.agent().identity().find(&identity).is_some() {
        ctx.db.agent().identity().update(Agent {
            identity,
            name,
            blurb,
        });
    } else {
        ctx.db.agent().insert(Agent {
            identity,
            name,
            blurb,
        });
    }
    Ok(())
}

/// Claim the payment-bridge role (trust-on-first-use). The first identity to call
/// this on a fresh database becomes the sole authorized payment finalizer; every
/// later caller is rejected unless it is that same identity (re-claiming is a
/// no-op). The engine's x402 bridge calls this once on connect, before it begins
/// finalizing sales via `record_payment`.
#[reducer]
pub fn claim_payment_bridge(ctx: &ReducerContext) -> Result<(), String> {
    let me = ctx.sender;
    if ctx.db.payment_bridge().identity().find(&me).is_some() {
        return Ok(()); // already the bridge -- idempotent
    }
    if ctx.db.payment_bridge().count() > 0 {
        return Err("payment bridge already claimed".to_string());
    }
    ctx.db.payment_bridge().insert(PaymentBridge { identity: me });
    Ok(())
}

/// Record the outcome of off-DB payment for a sale. Called ONLY by the engine's
/// x402 bridge (guarded to the claimed `payment_bridge` identity) after it runs
/// settlement. SECURITY: writes ONLY a synthetic status
/// ("settled"|"failed") + the on-chain tx_ref -- never an error message, key, or
/// response body. The `code` arg is accepted for the failure path (ABI parity
/// with the engine caller) but is deliberately NOT persisted; nothing about a
/// failure beyond the bare "failed" status crosses back into the database.
#[reducer]
pub fn record_payment(
    ctx: &ReducerContext,
    sale_id: u64,
    ok: bool,
    tx_ref: Option<String>,
    _code: Option<String>,
) -> Result<(), String> {
    // Only the registered payment bridge (the engine) may finalize a payment.
    // Fails closed: until the bridge claims its role no caller can mark a sale
    // paid, so a random client cannot forge a settled payment + tx_ref.
    if ctx.db.payment_bridge().identity().find(&ctx.sender).is_none() {
        return Err("record_payment: caller is not the payment bridge".to_string());
    }

    let mut sale = ctx
        .db
        .sale()
        .id()
        .find(&sale_id)
        .ok_or_else(|| "sale not found".to_string())?;

    if sale.payment_status != "awaiting_payment" {
        return Err("sale is not awaiting payment".to_string());
    }

    sale.payment_status = if ok { "settled" } else { "failed" }.to_string();
    // Only attach a tx_ref on success; a failure never carries an on-chain ref.
    sale.tx_ref = if ok { tx_ref } else { None };

    let listing_id = sale.listing_id;
    let buyer = sale.buyer;
    ctx.db.sale().id().update(sale);

    // Announce only a SUCCESSFUL payment, as "paid" (distinct from auction "won").
    // A failed payment is never broadcast -- the sale row's "failed" status is the
    // only record, so the shared feed never lies to the room.
    if ok {
        let (actor_name, _) = actor_profile(ctx, buyer);
        push_activity(ctx, "paid", listing_id, buyer, actor_name);
    }

    Ok(())
}

/// SCHEDULED reducer: fired by SpacetimeDB when an auction's `ends_at` arrives.
///
/// SECURITY: a scheduled reducer is still a normal, client-callable reducer, so
/// it is guarded -- only the scheduler (the module's own identity) may run it.
/// A direct client call has `ctx.sender != ctx.identity()` and is rejected.
///
/// Idempotent: if the auction is already settled (or gone), it returns cleanly.
/// On settlement it writes a Sale awaiting payment for the high bidder, flips
/// the auction to "settled", and appends a "won" activity event.
#[reducer]
pub fn settle_auction(
    ctx: &ReducerContext,
    schedule: SettleSchedule,
) -> Result<(), String> {
    if ctx.sender != ctx.identity() {
        return Err("settle_auction may only be called by the scheduler".to_string());
    }

    let mut auction = match ctx.db.auction().id().find(&schedule.auction_id) {
        Some(a) => a,
        // Auction vanished -- nothing to settle, treat as a no-op.
        None => return Ok(()),
    };

    // Idempotent guard: already settled means this is a duplicate fire.
    if auction.status != "open" {
        return Ok(());
    }

    // Settle to the high bidder if there is one. With no bids, just close it.
    if let Some(winner) = auction.high_bidder {
        ctx.db.sale().insert(Sale {
            id: 0,
            listing_id: auction.listing_id,
            buyer: winner,
            price_minor: auction.high_bid_minor,
            payment_status: "awaiting_payment".to_string(),
            tx_ref: None,
            at: ctx.timestamp,
        });

        // Count the auction win like a buy-now acquisition (same intent
        // semantics as buy_now), so auction wins are not silently uncounted.
        if let Some(mut listing) = ctx.db.listing().id().find(&auction.listing_id) {
            listing.acquired_count = listing.acquired_count.saturating_add(1);
            ctx.db.listing().id().update(listing);
        }

        let (actor_name, _) = actor_profile(ctx, winner);
        push_activity(ctx, "won", auction.listing_id, winner, actor_name);
    } else {
        log::info!(
            "auction {} settled with no bids on listing {}",
            auction.id,
            auction.listing_id
        );
    }

    auction.status = "settled".to_string();
    ctx.db.auction().id().update(auction);

    Ok(())
}

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------

fn is_valid_category(category: &str) -> bool {
    matches!(category, "agent" | "skill" | "workflow" | "tool")
}
