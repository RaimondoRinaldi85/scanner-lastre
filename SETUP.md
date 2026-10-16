# Scanner Lastre (offline): setup

The app works on Android with no internet. Slabs are stored on the phone and sent to a Google Sheet automatically when a connection is available.

There are 3 one-time steps: **Google Sheet → publish the app → install it on the phones**. Allow about 20 minutes.

---

## 1. Google Sheet: the script that receives the data

1. Open the Google Sheet you want to use (for example the one already linked to Scanner Lastre).
2. Menu **Extensions → Apps Script**.
3. Delete the existing code and paste in the full contents of `google-sheet-script/Codice.gs`.
4. On the line `const CODICE_SEGRETO = "cambia-questo-codice";` replace the text with a code only you know (for example `lastre-2026-xyz`). Save (disk icon).
5. Top right: **Deploy → New deployment**.
   - Type (gear icon): **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - **Deploy**, then **Authorise access** with your Google account (if "Google hasn't verified this app" appears: *Advanced → Go to …*: it's your own script).
6. Copy the **Web app URL** (ends in `/exec`). You'll need it on every phone.

> If you change the script later: **Deploy → Manage deployments → pencil icon → Version: New version → Deploy**. The URL stays the same.

How the sheet is filled: **one tab per container**, with a **Telefono** column. Each phone only rewrites its own rows, so several phones can scan the same container.

---

## 2. Publish the app (GitHub Pages, free)

The app has to be online **once**, so the phones can download and install it. After that it works offline.

1. Create a free account at https://github.com (if you don't have one).
2. **New repository** → name `scanner-lastre` → **Public** → **Create repository**.
3. On the repository page: **uploading an existing file** (or *Add file → Upload files*).
4. Drag in **the contents** of the `offline-app` folder (the `index.html`, `app.js`, … files and the `icons`, `vendor`, `google-sheet-script` folders), not the folder itself. **Commit changes**.
5. **Settings → Pages** → *Branch*: `main`, folder `/ (root)` → **Save**.
6. After 1–2 minutes the address appears, for example `https://YOUR-NAME.github.io/scanner-lastre/`.

The code contains no passwords: the secret code is typed only on the phones.

---

## 3. Install on each Android phone

1. Open the address from step 2 in **Chrome**, with a connection.
2. Tap **Installa l'app sul telefono** (or Chrome menu ⋮ → **Install app** / **Add to Home screen**).
3. Open the app from its icon, scroll down to **Impostazioni** and fill in:
   - **Nome di questo telefono**: e.g. `Mario` (each phone a different name)
   - **Indirizzo dello script del foglio**: the URL from step 1.6
   - **Codice segreto**: the one written in the script
4. **Salva**, then **Prova collegamento**: it should say *Collegamento riuscito*.
5. Wait about ten seconds with a connection: the app downloads the label-reading engine (about 11 MB) and saves it on the phone.

From then on it also works in **airplane mode**.

---

## How it reads labels without internet

- **Code**: taken from the **barcode**, which Chrome on Android reads by itself, reliably. If the barcode isn't found, the code is read from the text and highlighted: **check every digit**.
- **Material, thickness, color**: read from the label text by the phone (it takes a few seconds and is less accurate than Claude). From the second slab onwards they're **copied from the last slab** in the container.
- When you save a slab whose code matches the barcode, the app remembers that in that container **the barcode is the code**: the following slabs are read in about a second (barcode + copy). The **Leggi tutta l'etichetta** button forces a full reading.
- Materials already saved help recognise the name even when a letter is misread.
- **Converti B in 8**: on by default, remembered per container. On Dekton labels the app reminds you that the B is usually real.

## Sending to the sheet

- Automatic: after every change, when the connection returns and every minute.
- Manual: **Invia a Google Sheets** button.
- The pill at the top shows **Online/Offline** and how many containers are still to send.
- Deleting a container also removes **that phone's** rows from the sheet.

## Updating the app later

1. Replace the changed files in the GitHub repository.
2. In `sw.js` change `VERSION` (e.g. `scanner-lastre-v2`): without this, the phones keep using the old copy.
3. On the phones: open the app with a connection, close it and reopen it.

## Limits

- Reading the barcode needs **Chrome on Android** (it doesn't work on iPhone).
- Offline text reading is **less accurate** than Claude's: always check the first slab of each container.
- Data lives in the phone's memory: **don't clear Chrome's data** while there are containers still to send.
