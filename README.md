# Handball Athletik – Trainings-App

Kleine Web-App (PWA) für den Handball-Athletikplan: Einheiten A/B mit Warm-up und Cool-down, Abhaken von Sätzen, Timer mit Ansagen, Anleitungen und Videos, Verlauf und Planung der nächsten Einheit.

**App öffnen:** https://erik-wsld.github.io/Athletik/

- Kein Server, keine Datenbank, kein Build-Schritt: reine HTML/CSS/JS-Dateien
- Funktioniert offline und lässt sich wie eine App auf dem Handy installieren
- Veröffentlicht über GitHub Pages, das ist kostenlos
- Die Trainingsdaten liegen **nur auf deinem Gerät** und nicht in diesem Repo

## Auf dem iPhone installieren

1. https://erik-wsld.github.io/Athletik/ in **Safari** öffnen.
2. Teilen-Symbol → **Zum Home-Bildschirm**.
3. Ab jetzt nur noch über das App-Symbol trainieren.

Warum das wichtig ist:

- Normale Safari-Tabs löschen Website-Daten nach 7 Tagen ohne Nutzung. Für die App vom Home-Bildschirm gilt diese Regel nicht.
- Die App vom Home-Bildschirm hat einen **eigenen Speicher**. Safari-Tab und App teilen ihre Daten nicht.
- Wenn du das App-Symbol löschst, werden auch die Trainingsdaten gelöscht.
- Unter *Einstellungen → Daten auf diesem Gerät* zeigt die App an, ob sie installiert läuft und wann das letzte Backup war.

## Backups

*Einstellungen → Backup exportieren* → **In Dateien sichern**, am besten in den iCloud Drive. Über *Backup importieren* holst du die Daten zurück, auch auf ein neues Gerät. Nach 30 Tagen ohne Backup erinnert dich die App.

## Updates veröffentlichen

1. In `sw.js` die `VERSION` erhöhen (z. B. `'v3'` → `'v4'`), damit installierte Apps die neue Version laden.
2. Auf GitHub: **Add file → Upload files** → die geänderten Dateien hineinziehen. Gleichnamige Dateien werden ersetzt. Danach **Commit changes**.
3. 1–2 Minuten warten, bis unter **Actions** „pages build and deployment“ einen grünen Haken hat.
4. Auf dem iPhone die App ein- bis zweimal komplett schließen und neu öffnen. Unten in den Einstellungen steht die aktuelle Version.

Die Trainingsdaten bleiben bei Updates erhalten.

> **Achtung beim Umbenennen des Repos:** Der Repo-Name ist Teil der Adresse. Nach einer Umbenennung funktioniert das alte App-Symbol nicht mehr. Deshalb vorher ein Backup exportieren, danach die App neu zum Home-Bildschirm hinzufügen und das Backup importieren.

## Lokal testen

Im Ordner mit den Dateien:

```bash
python3 -m http.server 8765
```

Dann http://localhost:8765 öffnen.

## Dateien

| Datei | Inhalt |
|---|---|
| `index.html` | Grundgerüst der Seite |
| `data.js` | Trainingsplan: Übungen, Vorgaben, Anleitungen, Progression |
| `app.js` | App-Logik: Tracking, Timer, Videos, Verlauf, Planung |
| `styles.css` | Design (hell/dunkel automatisch) |
| `sw.js` | Offline-Cache und Versionsnummer |
| `manifest.webmanifest`, `icon*.png`, `icon.svg`, `apple-touch-icon.png` | App-Name und Symbole für den Home-Bildschirm |

Den Trainingsplan änderst du in `data.js`. Jede Übung hat dort Name, Sätze, Wiederholungen bzw. Zeit, Anleitungsschritte und einen YouTube-Suchbegriff.
