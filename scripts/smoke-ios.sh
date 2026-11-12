#!/usr/bin/env bash
# Prova dell'app iOS su simulatore iPhone 13 mini e iPad: installa l'app compilata, la avvia, aspetta,
# salva le schermate e controlla che il processo resti attivo. Uso: bash scripts/smoke-ios.sh <percorso .app>
set -u
APP="$1"; OUT=test-results/varianti; mkdir -p "$OUT"; BID=it.piantalibera.app
rt=$(xcrun simctl list runtimes -j | python3 -c 'import json,sys; r=[x for x in json.load(sys.stdin)["runtimes"] if x["isAvailable"] and x["platform"]=="iOS"]; print(r[-1]["identifier"])')
ko=0
for dev in "iPhone 13 mini" "iPad (10th generation)" ; do
  type=$(xcrun simctl list devicetypes -j | python3 -c "import json,sys; d=[x['identifier'] for x in json.load(sys.stdin)['devicetypes'] if x['name']=='$dev' or x['name'].startswith('$dev'.split(' (')[0]+' (')]; print(d[0] if d else '')")
  [ -z "$type" ] && type=$(xcrun simctl list devicetypes -j | python3 -c "import json,sys; print([x['identifier'] for x in json.load(sys.stdin)['devicetypes'] if x['name'].startswith('$dev'.split()[0])][-1])")
  nome="ios-$(echo "$dev" | tr ' ()' '-__' | tr -s '-' | tr 'A-Z' 'a-z')"
  udid=$(xcrun simctl create "$nome" "$type" "$rt"); xcrun simctl boot "$udid"; xcrun simctl bootstatus "$udid" -b >/dev/null
  E=()
  if xcrun simctl install "$udid" "$APP"; then E+=("\"installazione\":\"ok\""); else E+=("\"installazione\":\"difetto\""); fi
  t0=$(date +%s); xcrun simctl launch "$udid" "$BID" >/dev/null && E+=("\"avvio\":\"ok\"") || E+=("\"avvio\":\"difetto\"")
  sleep 75
  xcrun simctl io "$udid" screenshot "$OUT/$nome.png" >/dev/null 2>&1
  if xcrun simctl spawn "$udid" launchctl list | grep -q "$BID"; then E+=("\"app ancora attiva dopo 75 s\":\"ok\""); else E+=("\"app ancora attiva dopo 75 s\":\"difetto\""); ko=1; fi
  xcrun simctl spawn "$udid" log show --last 2m --predicate 'process == "PiantaLibera" OR subsystem CONTAINS "WebKit"' --style compact 2>/dev/null | grep -iE "error|crash" | head -40 > "$OUT/$nome-log.txt" || true
  IFS=,; echo "{\"variante\":\"$nome\",\"pronto_ms\":null,\"esiti\":{${E[*]}}}" >> "$OUT/varianti.jsonl"; unset IFS
  xcrun simctl shutdown "$udid"; xcrun simctl delete "$udid"
done
cat "$OUT/varianti.jsonl"; exit $ko
