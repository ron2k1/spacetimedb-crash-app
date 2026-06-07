// MarketplaceDashboard -- ONE script for both the skills market and the plugins market,
// parameterized by `kind` ("skill" | "plugin"). One prefab per market, same component.
//
// On enable it reads the bundled catalog index from StreamingAssets so the user can browse
// WITHOUT a socket round-trip:
//     StreamingAssets/catalog/<kind>s.json   (e.g. skills.json / plugins.json)
// The JSON is a top-level ARRAY of { id, name, description } -- mirrored by the backend's
// catalog seed (Slice D). It renders a card per item; Install sends marketplace.install via
// CrashApp.Instance.Client, and the matching marketplace.installed callback flips that card
// to "Installed" (the File Activity panel shows the copied files independently).
//
// House-style: legacy uGUI ([SerializeField] Text/Button), Newtonsoft for the catalog parse
// (JsonUtility cannot deserialize a top-level array), code-side event subscription in
// OnEnable/OnDisable, errors surfaced as CODE ONLY.
//
// SECURITY: catalog content is local, bundled, non-IP text (id/name/description only). The
// installed callback carries op-level path data the File Activity panel renders -- never any
// file contents.

using System;
using System.Collections.Generic;
using System.IO;
using UnityEngine;
using UnityEngine.UI;
using Newtonsoft.Json;
using Crash.Net;
using Crash.Protocol;
using Crash.World;

namespace Crash.Dashboards
{
    public class MarketplaceDashboard : MonoBehaviour
    {
        // The bundled catalog index entry shape. Matches StreamingAssets/catalog/<kind>s.json
        // (a top-level array of these). [Serializable] is harmless for Newtonsoft and keeps it
        // consistent with the rest of the project's payload classes.
        [Serializable]
        public class CatalogItem
        {
            public string id;
            public string name;
            public string description;
        }

        [Header("Market kind")]
        [Tooltip("'skill' or 'plugin'. Selects which StreamingAssets/catalog/<kind>s.json to " +
                 "read and is sent as the kind in marketplace.install.")]
        [SerializeField] private string kind = "skill";

        [Header("Client source")]
        [Tooltip("Optional explicit client. If null, uses CrashApp.Instance.Client.")]
        [SerializeField] private CrashWsClient client;

        [Header("Card list (uGUI)")]
        [Tooltip("Content transform under which item cards are instantiated.")]
        [SerializeField] private RectTransform cardsContent;

        [Tooltip("Card prefab: a RectTransform with two Texts (name + description) and an " +
                 "Install Button. The script finds them by component; see GetCardParts.")]
        [SerializeField] private GameObject cardPrefab;

        [Tooltip("Optional name (case-insensitive) of the child Text used for the item NAME. " +
                 "If blank, the FIRST Text found is treated as the name and the SECOND as the " +
                 "description.")]
        [SerializeField] private string nameTextChildName = string.Empty;

        [Header("Status")]
        [SerializeField] private Text statusLabel;

        // Per-card runtime handles so the installed callback can flip the right card.
        private class Card
        {
            public GameObject go;
            public string itemId;
            public string installId;   // the id we sent in marketplace.install (matched on callback)
            public Button installButton;
            public Text installButtonLabel;
            public bool installed;
        }

        // installId -> card (the install we are awaiting a callback for).
        private readonly Dictionary<string, Card> _cardsByInstallId = new Dictionary<string, Card>();
        // itemId -> card (so we never double-build, and can find a card without an installId).
        private readonly Dictionary<string, Card> _cardsByItemId = new Dictionary<string, Card>();

        private bool _built;

        // ----------------------------------------------------------------- lifecycle

        private void OnEnable()
        {
            if (client == null && CrashApp.Instance != null)
            {
                client = CrashApp.Instance.Client;
            }
            if (client != null)
            {
                client.OnMarketplaceInstalled += HandleMarketplaceInstalled;
                client.OnError += HandleError;
            }

            // Build the catalog once. (OnEnable can fire again after a disable; guard with _built.)
            if (!_built)
            {
                BuildCatalog();
                _built = true;
            }
        }

        private void OnDisable()
        {
            if (client != null)
            {
                client.OnMarketplaceInstalled -= HandleMarketplaceInstalled;
                client.OnError -= HandleError;
            }
        }

        // ----------------------------------------------------------------- catalog load

        private void BuildCatalog()
        {
            List<CatalogItem> items = LoadCatalog();
            if (items == null)
            {
                SetStatus("catalog unavailable");
                return;
            }
            foreach (CatalogItem item in items)
            {
                if (item == null || string.IsNullOrEmpty(item.id))
                {
                    continue;
                }
                AddCard(item);
            }
            SetStatus(items.Count + " " + kind + "s available");
        }

        // Read + parse StreamingAssets/catalog/<kind>s.json. Returns null on any failure (the
        // panel just shows "catalog unavailable"). NOTE: on Android/WebGL streamingAssetsPath is
        // a URL, not a file path, and File.ReadAllText will not work -- this targets the desktop
        // build (the only supported target for now). A platform UnityWebRequest path would be needed
        // for those targets.
        private List<CatalogItem> LoadCatalog()
        {
            string fileName = kind + "s.json"; // "skill" -> "skills.json", "plugin" -> "plugins.json"
            string path = Path.Combine(Application.streamingAssetsPath, "catalog", fileName);
            try
            {
                if (!File.Exists(path))
                {
                    Debug.LogWarning("[MarketplaceDashboard] catalog not found: " + fileName);
                    return null;
                }
                string json = File.ReadAllText(path);
                return JsonConvert.DeserializeObject<List<CatalogItem>>(json);
            }
            catch (Exception)
            {
                // Do not surface the exception message (could include a path); a marker is enough.
                Debug.LogWarning("[MarketplaceDashboard] failed to read/parse catalog " + fileName);
                return null;
            }
        }

        // ----------------------------------------------------------------- card build

        private void AddCard(CatalogItem item)
        {
            if (cardPrefab == null || cardsContent == null)
            {
                return;
            }
            if (_cardsByItemId.ContainsKey(item.id))
            {
                return; // already built
            }

            GameObject go = Instantiate(cardPrefab, cardsContent);
            go.SetActive(true);

            var card = new Card { go = go, itemId = item.id };

            Text nameText, descText;
            Button installButton;
            GetCardParts(go, out nameText, out descText, out installButton);

            if (nameText != null) nameText.text = item.name ?? item.id;
            if (descText != null) descText.text = item.description ?? string.Empty;

            card.installButton = installButton;
            if (installButton != null)
            {
                card.installButtonLabel = installButton.GetComponentInChildren<Text>();
                string capturedItemId = item.id; // capture for the closure
                installButton.onClick.AddListener(() => OnInstallClicked(capturedItemId));
            }

            _cardsByItemId[item.id] = card;
        }

        // Resolve a card prefab's two Texts + Install Button. If nameTextChildName is set we use
        // that child for the name and the next Text for the description; otherwise first Text =
        // name, second Text = description. The Button is the only Button under the card.
        private void GetCardParts(GameObject go, out Text nameText, out Text descText, out Button installButton)
        {
            nameText = null;
            descText = null;
            installButton = go.GetComponentInChildren<Button>();

            Text[] texts = go.GetComponentsInChildren<Text>(true);
            if (!string.IsNullOrEmpty(nameTextChildName))
            {
                foreach (Text t in texts)
                {
                    if (t == null) continue;
                    if (nameText == null && string.Equals(t.gameObject.name, nameTextChildName, StringComparison.OrdinalIgnoreCase))
                    {
                        nameText = t;
                    }
                    else if (descText == null && t != nameText && (installButton == null || t.transform.parent != installButton.transform))
                    {
                        descText = t;
                    }
                }
            }
            else
            {
                foreach (Text t in texts)
                {
                    if (t == null) continue;
                    // Skip the Install button's own label so it is not mistaken for name/desc.
                    if (installButton != null && t.transform.IsChildOf(installButton.transform))
                    {
                        continue;
                    }
                    if (nameText == null) nameText = t;
                    else if (descText == null) descText = t;
                }
            }
        }

        // ----------------------------------------------------------------- install flow

        private void OnInstallClicked(string itemId)
        {
            if (client == null || string.IsNullOrEmpty(itemId))
            {
                return;
            }
            if (!_cardsByItemId.TryGetValue(itemId, out Card card))
            {
                return;
            }
            if (card.installed)
            {
                return; // already installed; ignore repeat clicks
            }
            if (!client.IsSessionReady)
            {
                SetStatus("waiting for engine session...");
                return;
            }

            string installId = "ins_" + Guid.NewGuid().ToString("N").Substring(0, 12);
            card.installId = installId;
            _cardsByInstallId[installId] = card;

            // Optimistic UI: mark the button "Installing..." until the callback flips it.
            SetButtonLabel(card, "Installing...");
            if (card.installButton != null)
            {
                card.installButton.interactable = false;
            }

            client.SendMarketplaceInstall(installId, kind, itemId);
            SetStatus("installing " + itemId + "...");
        }

        private void HandleMarketplaceInstalled(MarketplaceInstalledPayload p)
        {
            if (p == null || string.IsNullOrEmpty(p.installId))
            {
                return;
            }
            // Match by the installId we sent. Ignore callbacks for other markets/cards.
            if (!_cardsByInstallId.TryGetValue(p.installId, out Card card))
            {
                return;
            }
            card.installed = true;
            SetButtonLabel(card, "Installed");
            if (card.installButton != null)
            {
                card.installButton.interactable = false;
            }
            SetStatus("installed " + (p.itemId ?? card.itemId));
        }

        private void HandleError(ErrorPayload p)
        {
            if (p == null)
            {
                return;
            }
            // SECURITY: code only -- never a message body.
            SetStatus("error: " + p.code + (p.retryable ? " (retryable)" : string.Empty));
            // A failed install leaves cards in "Installing..."; re-enable so the user can retry.
            // We do not know WHICH install failed (error carries no installId), so re-arm any
            // not-yet-installed card that is mid-flight.
            foreach (KeyValuePair<string, Card> kv in _cardsByInstallId)
            {
                Card card = kv.Value;
                if (card != null && !card.installed && card.installButton != null && !card.installButton.interactable)
                {
                    card.installButton.interactable = true;
                    SetButtonLabel(card, "Install");
                }
            }
        }

        // ----------------------------------------------------------------- helpers

        private static void SetButtonLabel(Card card, string text)
        {
            if (card != null && card.installButtonLabel != null)
            {
                card.installButtonLabel.text = text;
            }
        }

        private void SetStatus(string text)
        {
            if (statusLabel != null)
            {
                statusLabel.text = text;
            }
        }
    }
}
