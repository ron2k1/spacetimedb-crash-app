// CrashSocketDescriptor -- reads and parses the engine's <workspace>/.runtime/socket.json.
//
// The Crash engine (backend/src/socket/server.ts) binds a WebSocket on 127.0.0.1 and
// writes socket.json (mode 0600) with the host, port, per-session token, protocol
// version, and the live provider. THIS file is how the renderer discovers where to
// connect and which capability token to present in the `hello` frame.
//
// socket.json shape (from server.ts):
//   { "host": "127.0.0.1", "port": <int>, "token": "<hex>",
//     "protocolVersion": 1, "provider": "claude-code" | "codex" }
//
// SECURITY: the token is a localhost capability. Never log its value, never write it to
// any external sink. Treat the parsed descriptor like a secret in memory.

using System;
using System.IO;
using Newtonsoft.Json.Linq;

namespace Crash.Net
{
    /// <summary>
    /// Strongly-typed view of the engine's socket.json handshake file. Construct via
    /// <see cref="Load"/>, which throws a descriptive exception if the engine is not running.
    /// </summary>
    [Serializable]
    public class CrashSocketDescriptor
    {
        public string Host;
        public int Port;
        public string Token;
        public int ProtocolVersion;
        public string Provider;

        /// <summary>ws:// URL the client connects to. Always loopback.</summary>
        public string WsUrl => "ws://" + Host + ":" + Port;

        /// <summary>
        /// Resolve the default absolute path to socket.json, mirroring
        /// backend/src/workspace/paths.ts: CRASH_WORKSPACE env var, else &lt;home&gt;/Crash.
        /// On Windows &lt;home&gt; is %USERPROFILE% (e.g. C:\Users\you\Crash\.runtime\socket.json).
        /// </summary>
        public static string DefaultSocketJsonPath()
        {
            string workspaceRoot = Environment.GetEnvironmentVariable("CRASH_WORKSPACE");
            if (string.IsNullOrEmpty(workspaceRoot))
            {
                // UserProfile on Windows; HOME on macOS/Linux -- matches Node's os.homedir().
                string home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
                if (string.IsNullOrEmpty(home))
                {
                    home = Environment.GetEnvironmentVariable("HOME") ?? string.Empty;
                }
                workspaceRoot = Path.Combine(home, "Crash");
            }
            return Path.Combine(workspaceRoot, ".runtime", "socket.json");
        }

        /// <summary>
        /// Read + parse socket.json from an absolute path. Throws
        /// <see cref="FileNotFoundException"/> with a human-facing hint if the file is
        /// absent (the engine has not started yet), and <see cref="FormatException"/> if
        /// the file is present but malformed or missing required fields.
        /// </summary>
        public static CrashSocketDescriptor Load(string socketJsonPath)
        {
            if (string.IsNullOrEmpty(socketJsonPath))
            {
                throw new ArgumentException("socketJsonPath was null or empty.", nameof(socketJsonPath));
            }

            if (!File.Exists(socketJsonPath))
            {
                throw new FileNotFoundException(
                    "engine not running -- start the Crash engine first (socket.json not found at: " +
                    socketJsonPath + ")",
                    socketJsonPath);
            }

            string raw;
            try
            {
                raw = File.ReadAllText(socketJsonPath);
            }
            catch (Exception ex)
            {
                // Surface the IO category, not the file body (which holds the token).
                throw new IOException(
                    "could not read socket.json (" + ex.GetType().Name + ") at: " + socketJsonPath);
            }

            JObject obj;
            try
            {
                obj = JObject.Parse(raw);
            }
            catch (Exception)
            {
                // NEVER echo `raw` -- it contains the token.
                throw new FormatException("socket.json is present but not valid JSON at: " + socketJsonPath);
            }

            var descriptor = new CrashSocketDescriptor
            {
                Host = (string)obj["host"],
                Port = obj["port"] != null ? (int)obj["port"] : 0,
                Token = (string)obj["token"],
                ProtocolVersion = obj["protocolVersion"] != null ? (int)obj["protocolVersion"] : 0,
                Provider = (string)obj["provider"],
            };

            if (string.IsNullOrEmpty(descriptor.Host) || descriptor.Port <= 0 ||
                string.IsNullOrEmpty(descriptor.Token))
            {
                throw new FormatException(
                    "socket.json is missing required fields (host/port/token) at: " + socketJsonPath);
            }

            return descriptor;
        }
    }
}
