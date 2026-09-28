# House Points

A simple app for giving students house points for good behaviour.
Houses: **Amber, Emerald, Ruby and Sapphire**.

It is built for one teacher. Everything runs in the web browser, and your students and points are saved **only in that browser on that device**. Nothing is sent to a server.

## Using it

**Option 1 – on your computer:** download this repository (green **Code** button → **Download ZIP**), unzip it, and double-click `index.html`.

**Option 2 – as a web link (phone, laptop, classroom board):** turn on GitHub Pages
(Settings → Pages → *Deploy from a branch* → `main` / root). On a phone, choose "Add to Home Screen" and it works like an app, even offline.
On a free GitHub account, Pages needs the repository to be public. That is safe because the repository contains only the app, never your student data.

## What it does

| Screen | What you can do |
|---|---|
| **Classes** | Create a class for each group you teach (e.g. *10X Physics*, *11Y Physics*) and upload that class's list into it. Each class page shows its students, their points and the house totals for that class. Rename a class, remove a student from it, or delete it (keeping or deleting its students). |
| **Award** | Pick a class, tap one or more students, tap a reason (Effort, Respect, Kindness…), choose 1–5 points, press **Award**. Undo within a few seconds. Type a name and press Enter to select quickly. |
| **Leaderboard** | House totals for this week / month / term / year / all time, filtered by class. Top 10 students, what points were given for, and a **“Not recognised in the last 28 days”** list so quieter students aren't missed. **Show on big screen** gives a full-screen display for the classroom board or an assembly. |
| **Students** | Import class lists, add or edit students, set houses, put students into classes, archive students who have left (their points still count for their house). Select several students to change their house or class at once. |
| **History** | Every award, grouped by day, searchable. Remove a mistake. Export to CSV (opens in Excel). |
| **Settings** | Edit the reasons and their points, house names and colours, term dates, milestones (Bronze 25, Silver 50, Gold 100, Platinum 200 per academic year), classes. Backup, restore and export. |

## Importing students

The easiest way: **Classes → ＋ New class**, type the class name, then **Create & upload class list**. Or press **Upload list** on any existing class. Each class is uploaded separately, and a student who is in two of your classes is stored once and simply belongs to both.

You can also use **Students → Import CSV / PDF**. Either way you can use:

- **CSV**: best. Export a class list from SIMS, Arbor, Bromcom etc. as CSV. Columns like *Surname, Forename, Reg Group, House* are recognised automatically. For Excel files, use *File → Save As → CSV* first.
- **PDF**: class lists and registers printed to PDF. Table columns are detected automatically. Scanned (image-only) PDFs can't be read.
- **Paste**: copy names (or columns) from anywhere, one student per line.

Before anything is saved you see a preview. You can then:

- choose what each column is
- untick titles or page numbers
- fix names (`SMITH, John` becomes `John Smith` automatically)
- set a house or form for anyone missing one
- put everyone into a class, e.g. *10X Physics*

Students already on your list are matched by name, so importing another class never creates duplicates. They are simply added to the new class too.

## Keep a backup

Browser storage can be wiped (clearing history, a new laptop, a school IT reset). Use **Settings → Download backup** regularly. The app reminds you after 7 days. A backup file can also be restored on another device to move your data.

## Files

```
index.html          the app page
css/style.css       styles (light and dark mode)
js/store.js         data: students, awards, settings (localStorage)
js/importer.js      reading CSV / PDF / pasted lists
js/app.js           screens and interactions
js/vendor/          pdf.js (Mozilla, Apache-2.0) for reading PDFs
sw.js, manifest.webmanifest, icon.svg   install-to-home-screen and offline support
```

No build step. Plain HTML, CSS and JavaScript.
