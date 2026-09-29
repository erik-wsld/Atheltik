# Handball Athletik – Trainings-App

Kleine Web-App (PWA) für den Handball-Athletikplan: Einheiten A/B mit Warm-up und Cool-down, Abhaken von Sätzen, Timer mit Ansagen, Anleitungen und Videos, Verlauf und Planung der nächsten Einheit.

- Kein Server, keine Datenbank, kein Build-Schritt: reine HTML/CSS/JS-Dateien im Ordner `public/`
- Funktioniert offline und lässt sich wie eine App auf dem Handy installieren
- Die Daten liegen **nur auf deinem Gerät** (Browser-Speicher). Backups machst du unter *Einstellungen → Backup exportieren*.

## Lokal starten

```bash
python3 -m http.server 8765 --directory public
```

Dann http://localhost:8765 öffnen.

## Kostenlos veröffentlichen, nur für dich (Cloudflare Pages + Cloudflare Access)

Ergebnis: Du hast eine Adresse wie `https://athletik-deinname.pages.dev`. Beim ersten Aufruf fragt Cloudflare nach deiner E-Mail-Adresse und schickt dir einen Einmal-Code. Nur deine Adresse ist freigeschaltet. Beides ist im Free-Plan kostenlos.

### 1. App hochladen (Cloudflare Pages)

1. Kostenloses Konto auf https://dash.cloudflare.com anlegen.
2. Links **Workers & Pages** → **Create** → Reiter **Pages** → **Upload assets** (Drag & Drop).
3. Projektnamen wählen, z. B. `athletik-deinname` (wird Teil der URL).
4. Den Ordner **`public`** hineinziehen → **Deploy site**.
5. Die App ist jetzt unter `https://athletik-deinname.pages.dev` erreichbar – noch ohne Schutz.

### 2. Zugang auf dich beschränken (Cloudflare Access)

1. Im Dashboard links **Zero Trust** öffnen. Beim ersten Mal einen Teamnamen vergeben und den **Free-Plan** wählen (bis 50 Nutzer, 0 €; eventuell will Cloudflare trotzdem eine Zahlungsmethode hinterlegt haben).
2. **Access → Applications → Add an application → Self-hosted**.
3. Einstellungen:
   - **Application name:** Athletik
   - **Session duration:** z. B. *1 month* (dann musst du dich nur einmal im Monat neu anmelden)
   - **Domain:** `athletik-deinname.pages.dev`
     (optional zusätzlich `*.athletik-deinname.pages.dev`, damit auch Vorschau-URLs geschützt sind)
4. **Policy** anlegen: Action **Allow**, Regel **Include → Emails →** deine E-Mail-Adresse.
5. Als Login-Methode **One-time PIN** aktiviert lassen (Standard) → speichern.
6. Test: URL in einem privaten Browserfenster öffnen. Es muss die Cloudflare-Anmeldung kommen, danach die App.

### 3. Auf dem Handy installieren

- **iPhone (Safari):** URL öffnen, anmelden → Teilen-Symbol → **Zum Home-Bildschirm**.
- **Android (Chrome):** URL öffnen, anmelden → Menü ⋮ → **App installieren**.

Tipp fürs iPhone: Nutze immer die App vom Home-Bildschirm. Sie hat einen eigenen Speicher, der nicht wie bei normalen Safari-Seiten nach 7 Tagen ohne Nutzung gelöscht wird. Safari und Home-Bildschirm-App teilen ihre Daten nicht.

### 4. Updates veröffentlichen

1. In `public/sw.js` die `VERSION` erhöhen (z. B. `'v2'`), damit installierte Apps die neue Version laden.
2. In Cloudflare: Projekt öffnen → **Create deployment** → `public`-Ordner erneut hochladen.

Deine Trainingsdaten bleiben dabei erhalten, sie liegen ja auf dem Gerät.

### Alternativen

- **GitHub Pages:** kostenlos, aber öffentlich (kein Passwortschutz). Die URL kennt allerdings niemand, und die App enthält keine persönlichen Daten.
- **Netlify / Vercel:** Der Passwortschutz ist dort nur in kostenpflichtigen Plänen enthalten.
- **Eigene Domain:** In Cloudflare Pages unter *Custom domains* verknüpfbar. Die Domain selbst kostet ca. 10 € im Jahr.

## Dateien

| Datei | Inhalt |
|---|---|
| `public/data.js` | Trainingsplan: Übungen, Vorgaben, Anleitungen, Progression |
| `public/app.js` | App-Logik: Tracking, Timer, Verlauf, Planung |
| `public/styles.css` | Design (hell/dunkel automatisch) |
| `public/sw.js` | Offline-Cache |
