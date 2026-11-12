#!/usr/bin/env bash
# Prova dell'app Android su emulatore: installa l'APK, la avvia, aspetta che l'editor compaia nella WebView
# (testi dell'interfaccia letti con uiautomator), ruota lo schermo, salva le schermate e una riga in varianti.jsonl.
# Uso: bash scripts/smoke-android.sh <nome>   (con l'emulatore acceso e Pianta-Libera-Android.apk nella cartella)
set -u
NOME="android-${1:-telefono}"; OUT=test-results/varianti; mkdir -p "$OUT"
APK=${APK:-Pianta-Libera-Android.apk}; PKG=it.piantalibera.app
esito() { printf '"%s":"%s"' "$1" "$2"; }
E=()
adb wait-for-device
if adb install -r "$APK" >/dev/null 2>&1; then E+=("$(esito installazione ok)"); else E+=("$(esito installazione 'difetto: adb install')"); fi
t0=$(date +%s)
adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
trovato=""
for i in $(seq 1 100); do   # fino a 5 minuti: il primo avvio della WebView sull'emulatore è lento
  sleep 3
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 && adb pull /sdcard/ui.xml "$OUT/$NOME-ui.xml" >/dev/null 2>&1
  if grep -qE 'Seleziona|Pianta Libera|Progetti' "$OUT/$NOME-ui.xml" 2>/dev/null; then trovato=1; break; fi
done
pronto=$(( ($(date +%s) - t0) * 1000 ))
[ -n "$trovato" ] && E+=("$(esito 'editor nella WebView' ok)") || E+=("$(esito 'editor nella WebView' 'difetto: testi dell editor non trovati in 300 s')")
adb exec-out screencap -p > "$OUT/$NOME.png"
if adb shell pidof "$PKG" >/dev/null 2>&1; then E+=("$(esito 'app ancora attiva' ok)"); else E+=("$(esito 'app ancora attiva' 'difetto: processo chiuso')"); fi
# rotazione in orizzontale e ritorno
adb shell settings put system accelerometer_rotation 0; adb shell settings put system user_rotation 1; sleep 4
adb exec-out screencap -p > "$OUT/$NOME-orizzontale.png"
if adb shell pidof "$PKG" >/dev/null 2>&1; then E+=("$(esito 'rotazione' ok)"); else E+=("$(esito 'rotazione' 'difetto: app chiusa ruotando')"); fi
adb shell settings put system user_rotation 0
# tasto Indietro: l'app non deve chiudersi al primo tocco
adb shell input keyevent KEYCODE_BACK; sleep 2
if adb shell pidof "$PKG" >/dev/null 2>&1; then E+=("$(esito 'tasto Indietro' ok)"); else E+=("$(esito 'tasto Indietro' 'difetto: l app si chiude')"); fi
adb logcat -d -s chromium:E AndroidRuntime:E > "$OUT/$NOME-logcat.txt" 2>/dev/null || true
IFS=,; echo "{\"variante\":\"$NOME\",\"pronto_ms\":$pronto,\"esiti\":{${E[*]}}}" >> "$OUT/varianti.jsonl"; unset IFS
cat "$OUT/varianti.jsonl"
! grep -q difetto <(tail -1 "$OUT/varianti.jsonl")
