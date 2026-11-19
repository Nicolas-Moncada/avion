import sqlite3

conn = sqlite3.connect('aerocore.db')
c = conn.cursor()
c.execute("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
for name, sql in c.fetchall():
    print(f"=== {name} ===")
    print(sql.strip() if sql else "")
