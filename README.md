# מלאי הבית

אפליקציית PWA לניהול מלאי ביתי, תוקף ורשימת קניות. רצה על GitHub Pages ו-Supabase בתוכניות החינמיות.

## הקמה (פעם אחת)

### 1. Supabase
1. ליצור פרויקט חדש ב-supabase.com. לשמור את סיסמת מסד הנתונים במנהל סיסמאות.
2. ב-SQL Editor להריץ את `supabase/schema.sql`. בסוף הקובץ להוריד את סימן ההערה מהשורה של `allowed_users` ולשים בה את שתי כתובות האימייל.
3. ב-Authentication → Sign In / Providers: לכבות את "Allow new users to sign up".
4. ב-Authentication → Users: ליצור שני משתמשים עם אימייל וסיסמה (Add user, עם Auto Confirm).
5. ב-Project Settings → API להעתיק: Project URL, המפתח הציבורי (anon/publishable) ומפתח service_role.

### 2. GitHub
1. ריפו ציבורי לקוד הזה, וריפו פרטי ריק לגיבויים.
2. בריפו הציבורי, Settings → Pages: Source = GitHub Actions.
3. Settings → Secrets and variables → Actions:
   - **Variables:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `BACKUP_REPO` (בפורמט `user/repo`)
   - **Secrets:** `SUPABASE_SERVICE_ROLE_KEY`, `BACKUP_REPO_TOKEN` (טוקן fine-grained עם Contents: Read and write על ריפו הגיבוי בלבד)
4. דחיפה ל-main מפעילה את הפריסה. הכתובת: `https://<user>.github.io/<repo>/`

### 3. בטלפון
לפתוח את הכתובת ולהוסיף למסך הבית: באייפון דרך Safari → שיתוף → הוספה למסך הבית, ובאנדרואיד דרך Chrome → התקנת אפליקציה.

## פעולות מתוזמנות
- **keepalive.yml:** פונה למסד הנתונים כל 3 ימים, כדי ש-Supabase לא ישהה את הפרויקט.
- **backup.yml:** בכל יום ראשון מייצא את כל הטבלאות ל-JSON ואת הפריטים ל-CSV, ושומר אותם בריפו הפרטי.

אפשר להריץ את שתיהן ידנית מלשונית Actions.

## ייבוא CSV
עמודות: `name,category,location,quantity,target_quantity,package_size,expiry_date,notes`.
תאריך בפורמט `YYYY-MM-DD`. שורה עם שם שכבר קיים מעדכנת את הפריט. קטגוריה או מיקום שלא קיימים נוצרים בייבוא. דוגמה: `sample.csv`.

## פיתוח מקומי
```
cp .env.example .env.local   # למלא URL ומפתח ציבורי
npm install
npm run dev
```
