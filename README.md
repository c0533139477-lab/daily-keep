# Daily Keep

חוסכים כל יום מחדש. גרסת ענן אישית

כל בוקר המערכת נכנסת לכרטיסי האשראי שלך, בונה את סיכום ההוצאות ושולחת לך מייל.
הכול רץ בחשבון הגיטהאב שלך בלבד. פרטי הכניסה נשמרים מוצפנים בהגדרות הסודיות של החשבון שלך, ואף אחד אחר לא רואה אותם.

## הגדרות (קובץ settings.json)

- email: כתובת המייל שאליה יישלח הסיכום
- monthlyBudget: התקציב החודשי בשקלים (0 = בלי תקציב)
- cardNames: שמות לכרטיסים, לפי 4 הספרות. למשל: {"1234": "הכרטיס של הבית"}
- monthPeriod: ממתי נחשב החודש. calendar הוא gregorian (לועזי) או hebrew (עברי), ו-startDay הוא היום שבו החודש מתחיל
- fixedCharges: הוראות קבע ידניות. למשל: [{"id": "1", "name": "גן", "amount": 500, "dayOfMonth": 10}]

## פרטי הכניסה (הגדרות סודיות)

בהגדרות החשבון: Settings ואז Secrets and variables ואז Actions ואז New repository secret.
ממלאים רק את הכרטיסים שיש לך:

- מקס: MAX_USERNAME, MAX_PASSWORD
- כאל: CAL_USERNAME, CAL_PASSWORD
- ישראכרט: ISRACARD_ID (תעודת זהות), ISRACARD_CARD6 (6 ספרות אחרונות), ISRACARD_PASSWORD
- אמריקן אקספרס: AMEX_ID, AMEX_CARD6, AMEX_PASSWORD
- בנק הפועלים (בשביל הוראות קבע): HAPOALIM_USERCODE, HAPOALIM_PASSWORD

יש כרטיסים של שני אנשים באותה חברה? לאדם השני מוסיפים 2 אחרי שם החברה.
למשל: ISRACARD2_ID, ISRACARD2_CARD6, ISRACARD2_PASSWORD

## שליחת המייל

- מה-Gmail שלך: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN
- או בגרסת הבדיקה: RELAY_URL, RELAY_TOKEN

## הפעלה

לשונית Actions, בוחרים "Daily Keep" ולוחצים Run workflow.
אחרי הבדיקה הראשונה, המערכת רצה לבד כל בוקר.

---
נבנה ע"י חוי קוסובסקי - מקדמת עסקים ומשרדים · 053-3139477
