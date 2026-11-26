CREATE TABLE IF NOT EXISTS pettinee_automation(id integer PRIMARY KEY CHECK(id=1),doc jsonb NOT NULL);
INSERT INTO pettinee_automation(id,doc) VALUES(1,'{"enabled":false,"workerId":"","intervalMinutes":60,"maxPerHour":6,"startedAt":null,"nextCollectAt":null,"reason":""}') ON CONFLICT DO NOTHING;
INSERT INTO pettinee_migrations(version) VALUES('002-automation') ON CONFLICT DO NOTHING;
