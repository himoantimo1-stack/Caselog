# CaseLog, phone edition

Your anaesthesia and critical care logbook, stored **only on your iPhone**. There's no server, no account, and no sync. The app makes no outside requests. Nothing leaves the phone unless you share a file yourself, such as a backup, a spreadsheet or a summary.

It has every feature of CaseLog 1.1: tap-only case entry, templates, the board minimum numbers, daily and monthly charts, the Medications tab, rotations with ICU months, personal lists, and the patient-identifier guard. In place of sync it adds **Back up to Files**, **Restore**, **Share spreadsheet** and **Share summary**.

## How it works

The app's files (HTML, CSS, JavaScript and icons) are put on a free web host once. You open that address in Safari and add it to your Home Screen. From then on CaseLog runs from the copy on your phone, even in Airplane Mode, and your cases are saved inside it. The host only ever serves the app's code and never sees a case.

## Install (about 15 minutes, once)

### 1. Put the app online with GitHub Pages (free)

1. Create a free account at **github.com**.
2. Click **+** (top right), then **New repository**. Name it `caselog` and set it to **Public**; free Pages needs a public repository. The repository holds only the app's code, never your data. Click **Create repository**.
3. On the new repository page, click **uploading an existing file**. Unzip `caselog-phone.zip`, open the `caselog-phone` folder, select **everything inside it** (including the `icons` folder) and drag it into the page. Click **Commit changes**.
4. Go to **Settings**, then **Pages**. Under *Build and deployment*, set Source to **Deploy from a branch**, choose **main** and **/ (root)**, then click **Save**.
5. After about a minute the page shows your address: `https://<your-username>.github.io/caselog/`.

### 2. Add it to your iPhone

1. Open that address in **Safari** on your iPhone.
2. Tap **Share**, then **Add to Home Screen**, then **Add**.
3. Open CaseLog **from the Home Screen icon**, and always use the icon from now on.

The Home Screen app and a Safari tab keep separate storage, so cases logged in a Safari tab won't appear in the app. CaseLog shows a short guide if you open it in Safari.

### 3. First things to do

- Go to **More**, then **Printed summaries**, and enter your name.
- Log a test case, then go to **More**, then **Back up to Files**, then **Save to Files**. Choose **iCloud Drive** if you use it, so a copy lives off the phone. Then delete the test case.
- Add your current rotation, and save templates for your common cases.

## Test it first on your computer (optional)

Unzip the folder, open a terminal in it and run:

```
python -m http.server 8000
```

Then open `http://localhost:8000` in Chrome or Edge. Press F12, then Ctrl+Shift+M, and pick an iPhone to see the phone layout. On a computer, shared files download instead of opening the share sheet.

## Backups: the one habit that matters

Your cases exist **only on this phone**. If the phone is lost, reset or replaced, or you delete the Home Screen icon, the logbook goes with it unless you have a backup.

- The pill at the top right shows how many cases aren't backed up yet. Tap it to back up.
- A yellow reminder appears on the Logbook when it has been more than 7 days.
- A backup is a single `.json` file. **More**, then **Restore from a backup**, merges it into the app. Where the same case exists, the newer version is kept, so restoring the same file twice is harmless.
- **New phone:** install CaseLog the same way, then restore your latest backup.
- **Moving from the server edition:** in the server version go to More, then Download full backup, then restore that file here.

iOS doesn't delete Home Screen apps' data on a timer, but it can clear website data if the phone runs critically low on storage. That's another reason to back up weekly.

## Sharing your numbers

- **Share summary** (Progress tab) creates a one-page file with your board minimum numbers, breakdowns, the medications you've managed, and signature lines. Save it to Files, open it, and use Share, then Print. Pinch out on the print preview to save a PDF, or email it to print from a computer.
- **Print** prints the Progress page directly where iOS allows it.
- **Share spreadsheet** creates a CSV with one row per case (41 columns), which opens in Excel or Numbers.

## Updating the app

Upload the changed files to the same GitHub repository and replace the old ones. The phone picks up the update in the background and shows it from the next launch. Your cases aren't touched by an update.

**Keep the same address.** Your data is tied to `https://<your-username>.github.io/caselog/`. If you rename the repository or your account, the app at the new address starts empty, and you'd move your data across with backup and restore.

## Customising

`options.js` holds the built-in pick-lists, the board minimum numbers and the in-hours window (07:30 to 15:30, with Saturday and Sunday as the weekend). Edit it and upload it again. For everyday additions such as a surgeon, drug or comorbidity, use **+ Add** in a case or More, then My lists. No file editing is needed.

## Privacy

- **Never record identifiers.** Don't enter names, file or MRN numbers, dates of birth, or Emirates ID numbers. Saving is blocked if notes look like they contain one.
- **Protect your phone.** It holds the only copy, so keep a passcode and Face ID on it. Backup files contain your whole logbook, so keep them in your own iCloud Drive or Files rather than shared folders.
- **Check with the hospital first.** Even a de-identified personal logbook can fall under hospital or DHA/MOHAP rules. Show this page to your programme director or the hospital's data protection officer before you start.
- **What the app does on the network:** it fetches only its own files from your GitHub Pages address. It uses no analytics, fonts, scripts or trackers from anywhere else, and a Content Security Policy blocks any other connection.

## Requirements

An iPhone on iOS 16 or later (iOS 17 or later recommended). Any modern desktop browser works for testing.
