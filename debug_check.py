import sqlite3

conn = sqlite3.connect("smart_exam.db")
cursor = conn.cursor()

# Check exact schema of all tables
cursor.execute("SELECT sql FROM sqlite_master WHERE type='table'")
for row in cursor.fetchall():
    print(row[0])
    print("---")

# Check column info for attempts
print("\nATTEMPTS TABLE COLUMNS:")
cursor.execute("PRAGMA table_info(attempts)")
for row in cursor.fetchall():
    print(row)

print("\nUSERS TABLE COLUMNS:")
cursor.execute("PRAGMA table_info(users)")
for row in cursor.fetchall():
    print(row)

conn.close()
