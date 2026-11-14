# מלאי הבית

אפליקציית PWA לניהול מלאי ביתי, תוקף ורשימת קניות. רצה על GitHub Pages ו-Supabase בתוכניות החינמיות.

## הקמה (פעם אחת)

### 1. Supabase
1. ליצור פרויקט חדש ב-supabase.com. לשמור את סיסמת מסד הנתונים במנהל סיסמאות.
2. ב-SQL Editor להריץ את `supabase/schema.sql`. בסוף הקובץ להוריד את סימן ההערה מהשורה של `allowed_users` ולשים בה את שתי כתובות האימייל.
3. כניסה עם Google: ליצור OAuth Client מסוג Web ב-Google Cloud Console, עם Authorized redirect URI `https://<project>.supabase.co/auth/v1/callback`, ולהזין את Client ID ו-Client Secret ב-Authentication → Sign In / Providers → Google.
4. ב-Authentication → URL Configuration: Site URL ו-Redirect URL הם כתובת האתר ב-GitHub Pages.
5. ההרשמה נשארת פתוחה. מי שמתחבר ואינו ב-`allowed_users` רואה מסך "עדיין לא הוזמן" ואין לו גישה לנתונים. מזמינים אנשים מהאפליקציה: הגדרות → חברי הבית.
5. ב-Project Settings → API להעתיק: Project URL, מפתח ה-publishable ומפתח secret (sb_secret_...).

### 2. GitHub
1. ריפו ציבורי לקוד הזה, וריפו פרטי ריק לגיבויים.
2. בריפו הציבורי, Settings → Pages: Source = GitHub Actions.
3. Settings → Secrets and variables → Actions:
   - **Variables:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `BACKUP_REPO` (בפורמט `user/repo`)
   - **Secrets:** `SUPABASE_SECRET_KEY`, `BACKUP_REPO_TOKEN` (טוקן fine-grained עם Contents: Read and write על ריפו הגיבוי בלבד)
4. דחיפה ל-main מפעילה את הפריסה. הכתובת: `https://<user>.github.io/<repo>/`

### 3. בטלפון
לפתוח את הכתובת ולהוסיף למסך הבית: באייפון דרך Safari → שיתוף → הוספה למסך הבית, ובאנדרואיד דרך Chrome → התקנת אפליקציה.

## פעולות מתוזמנות
- **keepalive.yml:** כל 3 ימים מעדכן חותמת זמן בטבלת `heartbeat`, כדי ש-Supabase לא ישהה את הפרויקט. משתמש במפתח הציבורי בלבד.
- **backup.yml:** בכל יום ראשון מייצא את כל הטבלאות ל-JSON ואת הפריטים ל-CSV, ושומר אותם בריפו הפרטי.

אפשר להריץ את שתיהן ידנית מלשונית Actions.

## ייבוא CSV
עמודות: `name,category,location,quantity,target_quantity,package_size,expiry_date,open_shelf_days,notes`.
תאריך בפורמט `YYYY-MM-DD`. `open_shelf_days` הוא מספר הימים שהפריט טוב אחרי פתיחה. שורה עם שם שכבר קיים מעדכנת את הפריט. קטגוריה או מיקום שלא קיימים נוצרים בייבוא. דוגמה: `sample.csv`.

## פיתוח מקומי
```
cp .env.example .env.local   # למלא URL ומפתח ציבורי
npm install
npm run dev
```
