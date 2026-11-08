// Pianta Libera — app per iPhone, iPad e Android.
// L'editor è quello pubblicato (aggiornamenti immediati senza ripubblicare l'app); qui aggiungiamo ciò che
// una pagina web non fa da sola in un'app: salvataggio e condivisione dei file esportati, tasto Indietro di
// Android, collegamenti esterni nel browser, schermata chiara quando manca la rete.
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, BackHandler, Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import Constants from "expo-constants";
import { WebView, type WebViewMessageEvent, type WebViewNavigation, type WebViewProps } from "react-native-webview";
import type { ComponentType, Ref } from "react";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

const SITE: string = (Constants.expoConfig?.extra as { site?: string } | undefined)?.site || "https://pianta-libera.gianpaolo-franceschini.workers.dev/";
const ORIGIN = new URL(SITE).origin;
const MAX_FILE = 80 * 1024 * 1024;
// i tipi del componente di classe non combaciano con React 19: lo si usa con le sue proprietà dichiarate
const NativeWebView = WebView as unknown as ComponentType<WebViewProps & { ref?: Ref<WebView> }>;

type SaveMessage = { type: "save"; name: string; mime?: string; b64: string };
const safeName = (n: string) => (n || "pianta-libera").replace(/[^\w.\- ]+/g, "_").slice(0, 120);

export default function App() {
  const web = useRef<WebView>(null);
  const [canBack, setCanBack] = useState(false);
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => { if (canBack) { web.current?.goBack(); return true; } return false; });
    return () => sub.remove();
  }, [canBack]);

  const onMessage = useCallback(async (e: WebViewMessageEvent) => {
    let msg: SaveMessage;
    try { msg = JSON.parse(e.nativeEvent.data); } catch { return; }
    if (msg?.type !== "save" || typeof msg.b64 !== "string" || msg.b64.length > MAX_FILE * 1.37) return;
    try {
      const file = new File(Paths.cache, safeName(msg.name));
      if (file.exists) file.delete();
      file.create();
      file.write(msg.b64, { encoding: "base64" });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: msg.mime || "application/octet-stream", dialogTitle: msg.name, UTI: undefined });
      web.current?.injectJavaScript(`window.dispatchEvent(new CustomEvent("pl-native-saved",{detail:${JSON.stringify(msg.name)}}));true;`);
    } catch (err) {
      web.current?.injectJavaScript(`window.dispatchEvent(new CustomEvent("pl-native-error",{detail:${JSON.stringify(String(err))}}));true;`);
    }
  }, []);

  // resta dentro il sito; tutto il resto (privacy esterne, GitHub, Poly Haven…) si apre nel browser del telefono
  const onNav = useCallback((req: WebViewNavigation & { isTopFrame?: boolean }) => {
    // i riquadri interni della pagina (verifica anti-bot Cloudflare Turnstile, ecc.) restano dentro la pagina:
    // aprirli nel browser faceva comparire finestre bianche di Cloudflare e nascondeva la verifica
    if (req.isTopFrame === false) return true;
    if (req.url.startsWith(ORIGIN) || req.url.startsWith("about:") || req.url.startsWith("blob:") || req.url.startsWith("data:")) return true;
    if (/^https?:/.test(req.url)) { Linking.openURL(req.url); return false; }
    return false;
  }, []);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.root} edges={["top", "left", "right"]}>
        <StatusBar style="auto" />
        {offline ? (
          <View style={styles.center}>
            <Text style={styles.title}>Pianta Libera</Text>
            <Text style={styles.text}>Per la prima apertura serve la connessione a internet. Dopo, l'editor funziona anche senza rete.</Text>
            <Pressable style={styles.btn} onPress={() => { setOffline(false); setLoading(true); web.current?.reload(); }}><Text style={styles.btnText}>Riprova</Text></Pressable>
          </View>
        ) : null}
        <NativeWebView
          ref={web}
          source={{ uri: SITE }}
          style={offline ? styles.hidden : styles.web}
          originWhitelist={["https://*", "about:*", "blob:*", "data:*"]}
          applicationNameForUserAgent="PiantaLiberaApp/1.0"
          javaScriptEnabled
          domStorageEnabled
          allowsBackForwardNavigationGestures
          allowsInlineMediaPlayback
          allowFileAccess={false}
          setSupportMultipleWindows={false}
          pullToRefreshEnabled={false}
          bounces={false}
          overScrollMode="never"
          cacheEnabled
          onShouldStartLoadWithRequest={onNav}
          onNavigationStateChange={(s: WebViewNavigation) => setCanBack(s.canGoBack)}
          onMessage={onMessage}
          onLoadEnd={() => setLoading(false)}
          onError={() => { setOffline(true); setLoading(false); }}
          onHttpError={(e: { nativeEvent: { statusCode: number } }) => { if (e.nativeEvent.statusCode >= 500) setOffline(true); }}
        />
        {loading && !offline ? <View style={styles.loading} pointerEvents="none"><ActivityIndicator size="large" color="#1f6f62" /></View> : null}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#e9ece8" },
  web: { flex: 1, backgroundColor: "#e9ece8" },
  hidden: { height: 0, flex: 0, opacity: 0 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28, gap: 12 },
  title: { fontSize: 24, fontWeight: "700", color: "#1d2320" },
  text: { fontSize: 16, lineHeight: 23, color: "#1d2320", textAlign: "center" },
  btn: { backgroundColor: "#1f6f62", paddingVertical: 12, paddingHorizontal: 22, borderRadius: 8, marginTop: 8 },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  loading: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
});
