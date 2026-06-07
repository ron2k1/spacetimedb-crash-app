# SpacetimeDB architecture -- the real-time backbone

How SpacetimeDB is wired into Crash as the backend for the multiplayer marketplace and live
auctions. This mirrors the shipped module in `spacetime-module/src/lib.rs`, which compiles cleanly
against the pinned `spacetimedb = "1.3.0"` crate (`spacetime build` -> wasm32 artifact). The Rust
shown here is the real schema: `name = ...` table macros, `ctx.sender` / `ctx.timestamp` as fields,
the 1.x spelling the compiler accepts. (The current web docs are a 2.0 snapshot using `accessor =` /
`ctx.sender()`; do not "fix" this toward them without re-pinning the crate.)

## The one idea

In SpacetimeDB the **database is the backend**. There is no separate app server for the
marketplace. The `spacetime-module` Rust crate compiles to WebAssembly and is published *into* the
database. From then on:

- **Tables** are the entire shared state.
- **Reducers** are the entire write API -- transactional functions that run inside the database.
- **Subscriptions** are the entire read/realtime layer -- a client subscribes to a SQL query and
  the database streams it every matching insert / update / delete as it commits.

A client (the Tauri renderer, or a headless agent) never writes a row directly. It calls a reducer;
the reducer commits; every subscriber sees the delta. That is the whole loop.

## Why this replaces the storefront (not augments it)

Today `marketplace-server/` (Express + `ws`, port `:8787`) is the source of truth. Its
`src/store.ts` hand-rolls four things SpacetimeDB provides natively:

| `store.ts` does by hand | SpacetimeDB does natively |
|-------------------------|---------------------------|
| `class MarketStore extends EventEmitter` -- in-process pub/sub | Subscriptions: every client is a subscriber, cross-process, over the network |
| `writeFileSync('data/listings.json')` per mutation | Durable transactional storage inside the database |
| `safeParse` / typed shapes redeclared in `types.ts` | Schema *is* the table definition; client types are generated from it |
| Manual `broadcast()` to every connected `ws` | The database streams row deltas to subscribers automatically |

Porting `store.ts` to reducers + tables is a **net deletion**: the emitter, the JSON persistence,
the broadcast loop, and the duplicated validation all go away. That deletion is the evidence the
database is doing real, load-bearing work.

## Identity -- humans and agents are the same kind of client

Every connection to a SpacetimeDB database gets an **Identity**: a 256-bit id, available inside a
reducer as `ctx.sender`. Crash uses it as the single notion of "who":

- A person at the Tauri app connects and gets an identity.
- A headless engine agent connects (its own SpacetimeDB client) and gets a *different* identity.
- `place_bid`, `create_listing`, `buy_now` all stamp `ctx.sender` as the actor.

Nothing in the schema privileges a human over an agent. The auction house is genuinely mixed: the
high bidder on a listing may be a person or an autonomous LLM agent, and the row looks the same
either way. The optional `agent` table just lets an agent advertise a display name and capability
so it shows up as a named participant rather than a raw identity.

## Data model (tables)

Public tables are client-visible (subscribable). Ported from `marketplace-server/src/types.ts`.

```rust
// An item for sale: agent | skill | workflow | tool.
#[spacetimedb::table(name = listing, public)]
pub struct Listing {
    #[primary_key] #[auto_inc] id: u64,          // auto-assigned (see #[auto_inc])
    name: String,
    blurb: String,
    category: String,                // "agent" | "skill" | "workflow" | "tool"
    price_minor: u64,                // USDC minor units, matches the x402 ledger
    seller_identity: Identity,       // who listed it (human or agent)
    seller_name: String,             // display name
    seller_is_agent: bool,
    tags: Vec<String>,
    created_at: Timestamp,
    acquired_count: u32,
}

// A live auction over a listing.
#[spacetimedb::table(name = auction, public)]
pub struct Auction {
    #[primary_key] #[auto_inc] id: u64,
    #[index(btree)] listing_id: u64, // settle_auction & clients look up by listing
    high_bid_minor: u64,             // current high bid (0 = no bids yet)
    high_bidder: Option<Identity>,
    min_increment_minor: u64,
    ends_at: Timestamp,              // when settle_auction fires
    status: String,                  // "open" | "settled"
}

// One bid -- append-only ledger of the room.
#[spacetimedb::table(name = bid, public)]
pub struct Bid {
    #[primary_key] #[auto_inc] id: u64,
    #[index(btree)] auction_id: u64, // pull every bid for an auction
    bidder: Identity,
    amount_minor: u64,
    at: Timestamp,
}

// A settled (or settling) sale. The spec called this `order`, but `ORDER` is a
// SQL reserved word, so the shipped table/struct is `sale`; the reducer arg is
// `sale_id` and the engine subscribes to `... FROM sale WHERE payment_status ...`.
#[spacetimedb::table(name = sale, public)]
pub struct Sale {
    #[primary_key] #[auto_inc] id: u64,
    listing_id: u64,
    buyer: Identity,
    price_minor: u64,
    #[index(btree)]                  // the engine subscribes on this column
    payment_status: String,          // "awaiting_payment" | "settled" | "failed"
    tx_ref: Option<String>,          // on-chain reference once record_payment writes it
    at: Timestamp,
}

// A registered agent participant (so agents are first-class in the catalog).
#[spacetimedb::table(name = agent, public)]
pub struct Agent {
    #[primary_key] identity: Identity,
    name: String,
    blurb: String,
}

// The shared, capped activity feed every client renders.
#[spacetimedb::table(name = activity, public)]
pub struct Activity {
    #[primary_key] #[auto_inc] id: u64,
    kind: String,                    // "listed" | "bid" | "acquired" | "won" | "paid"
    listing_id: u64,
    actor: Identity,
    actor_name: String,
    at: Timestamp,
}

// Scheduled table that arms settle_auction. SpacetimeDB fires the bound reducer
// for each row when its scheduled_at is due. PRIVATE (no `public`): it is a
// server-side timer, not client state. Carries the auction_id as payload.
#[spacetimedb::table(name = settle_schedule, scheduled(settle_auction))]
pub struct SettleSchedule {
    #[primary_key] #[auto_inc] id: u64,
    auction_id: u64,
    scheduled_at: ScheduleAt,
}

// Private allowlist of identities allowed to finalize payments via record_payment.
// NOT public: clients cannot read or subscribe to it. The engine's x402 bridge
// claims this role once at startup (claim_payment_bridge); thereafter only that
// identity may mark a sale paid, so a random client cannot forge a settled sale.
#[spacetimedb::table(name = payment_bridge)]
pub struct PaymentBridge {
    #[primary_key] identity: Identity,
}
```

## Reducers (the write API)

Every reducer is transactional: it either commits fully or not at all, and concurrent reducers are
serialized by the database, so there is no bid-race to reason about on the client.

```rust
#[spacetimedb::reducer]
fn create_listing(ctx, name, blurb, category, price_minor, tags) { ... }
// insert Listing { seller_identity: ctx.sender, ... }; insert Activity { kind: "listed", ... }

#[spacetimedb::reducer]
fn create_auction(ctx, listing_id, start_minor, min_increment_minor, duration_secs) { ... }
// require the listing exists and has no other "open" auction (one live auction per listing);
// cap duration at 7 days and add fallibly (checked_add_duration -> Err, never a panic);
// insert Auction { ends_at, status: "open", ... };
// insert a one-shot SettleSchedule { scheduled_at: ScheduleAt::Time(ends_at) } to arm settlement

#[spacetimedb::reducer]
fn place_bid(ctx, auction_id, amount_minor) { ... }
// load auction; require status == "open" && ctx.timestamp < ends_at;
// require amount_minor >= high_bid_minor + min_increment_minor;
// insert Bid; update Auction.high_bid_minor / high_bidder; insert Activity { kind: "bid" }

#[spacetimedb::reducer]
fn buy_now(ctx, listing_id) { ... }
// insert Sale { buyer: ctx.sender, payment_status: "awaiting_payment", price snapshot from listing };
// bump Listing.acquired_count; insert Activity { kind: "acquired" }

#[spacetimedb::reducer]
fn register_agent(ctx, name, blurb) { ... }
// upsert Agent { identity: ctx.sender, name, blurb }

#[spacetimedb::reducer]
fn claim_payment_bridge(ctx) { ... }
// trust-on-first-use: the first caller becomes the sole payment finalizer; re-claiming is a no-op,
// any other caller is rejected. The engine's x402 bridge calls this once on connect.

#[spacetimedb::reducer]
fn record_payment(ctx, sale_id, ok, tx_ref, _code) { ... }
// guard: caller must be the claimed payment_bridge identity, else reject (no forged "paid" sales);
// require the sale is still "awaiting_payment";
// set Sale.payment_status -> "settled" | "failed"; attach tx_ref only on success;
// on success only, insert Activity { kind: "paid" } (a failure is never broadcast).
// SECURITY: the `_code` failure arg is accepted for ABI parity but deliberately NOT persisted --
// nothing about a failure beyond the bare "failed" status crosses back into the database.
```

### Scheduled settlement -- the auction clock is real

SpacetimeDB fires a reducer for each due `SettleSchedule` row. `create_auction` inserts a one-shot
row scheduled for `ends_at`, so `settle_auction` runs -- server-side, with no client awake -- and:

1. Checks `ctx.sender == ctx.identity()` (only the scheduler may run it) and loads the auction;
   if the auction is gone or already `settled`, it returns cleanly (idempotent).
2. If there is a high bidder it writes a `Sale { payment_status: "awaiting_payment" }` for the
   winner and bumps the listing's `acquired_count` (an auction win counts like a buy-now).
3. Marks the auction `settled` and appends an `Activity { kind: "won" }`. With no bids it just
   closes the auction (no sale, no activity row).

Because settlement lives in the database on a schedule, the countdown every client renders is
backed by a real server event, not a client-side timer that lies when the tab is closed.

### Payment is a side-channel, by necessity

Reducers are deterministic and sandboxed: **no outbound HTTP or chain calls inside a reducer**. So
payment cannot run inside `settle_auction`. The flow crosses the database boundary on purpose:

```
settle_auction / buy_now (in DB)  engine (outside DB)              record_payment (in DB)
  writes Sale                       subscribed to sales              writes tx_ref + status
  status=awaiting_payment   --->    where status=awaiting    --->    status=settled|failed
                                    runs x402 USDC settlement
                                    (ERC-3009 gasless, Base)
```

The engine connects as its own SpacetimeDB client, calls `claim_payment_bridge` once to take the
payment-finalizer role, then subscribes to `SELECT * FROM sale WHERE payment_status =
'awaiting_payment'`. When such a row appears it runs the existing x402 buyer
(`backend/src/payments/buyer.ts`), then calls `record_payment` with the on-chain `tx_ref` (or, on
failure, a synthetic `code`). `record_payment` rejects any caller that is not the claimed bridge, so
a random client cannot forge a paid sale. The database stays pure; the real payment rail stays real;
and only a synthetic status -- never `err.message`, a key, or a response body -- is ever written back.

## Subscriptions (what each client reads)

| Client | Subscribes to |
|--------|---------------|
| Tauri renderer | `listing`, `auction`, `bid` (for the open auction), `activity` -- the live storefront + room |
| An agent participant | the same catalog + auction tables it wants to act in |
| The engine (payment bridge) | `sale WHERE payment_status = 'awaiting_payment'` |

The renderer subscribes to SpacetimeDB directly for marketplace + auction state; the engine's
35-event WebSocket protocol stays focused on the single-user agent run (chat, plan, tool activity).
Two surfaces, cleanly separated: the shared world (SpacetimeDB) and the private session (the socket).

## Build, publish, generate

```powershell
cd spacetime-module
spacetime build                                     # compile Rust -> WASM, fully offline
spacetime login                                     # one-time interactive auth to Maincloud
spacetime publish -s maincloud crash-y77jx          # upload the module into the hosted database
spacetime generate --lang typescript --out-dir ../frontend/r3f-shell/src/stdb   # typed client SDK
spacetime logs -s maincloud crash-y77jx             # tail reducer logs
```

`spacetime generate` reads the module's table + reducer definitions and emits a typed TypeScript
client -- so the renderer's marketplace types come *from* the schema instead of being redeclared.

## De-risking spikes (the go/no-go gate)

Two unknowns are proven before the full port, because they are the only places the design can fail:

1. **Scheduled reducer fires.** A throwaway `tick` reducer scheduled a few seconds out, observed
   firing in `spacetime logs`. Proves auto-settling auctions are possible exactly as designed.
2. **Node engine as a client.** The engine connects to `crash-y77jx` with the generated SDK,
   subscribes to a table, and calls a reducer. Proves the payment side-channel and
   agents-as-clients are possible.

Both spikes have since passed and the module is wired end-to-end: the renderer and the headless bid
bots subscribe to the live module (see the root `README.md` for the live status and
[`DEMO.md`](DEMO.md) for the proven human + agent run). The `marketplace-server` storefront remains
as the fixed-price catalog floor and the schema this module was ported from.
