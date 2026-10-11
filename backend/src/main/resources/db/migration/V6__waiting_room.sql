ALTER TABLE events ADD COLUMN waiting_room_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE events ADD COLUMN waiting_room_rate integer CHECK (waiting_room_rate BETWEEN 1 AND 1000);
ALTER TABLE events ADD COLUMN waiting_room_mode varchar(10) CHECK (waiting_room_mode IN ('fifo','lottery'));
