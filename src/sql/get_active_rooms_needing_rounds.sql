CREATE OR REPLACE FUNCTION get_active_rooms_needing_rounds()
RETURNS TABLE(id int, active boolean, contract_address text, room_config jsonb) AS $$
BEGIN
    RETURN QUERY

    SELECT rooms.id, rooms.active, rooms.contract_address, rooms.room_config
    FROM   rooms
    WHERE  rooms.active = true
           and rooms.contract_address is not null
           and (
                not exists (
                    select  1
                    from    rounds
                    where   rounds.room_id = rooms.id
                            and rounds.active = true
                 )
                or exists (
                    select 1
                    from   rounds
                    where  rounds.room_id = rooms.id
                            and rounds.active = true
                            and rounds.status = 'STARTING'
                            and rounds.updated_at < NOW() - INTERVAL '60 seconds'
                )
           );
END;
$$ LANGUAGE plpgsql;

-- select * from rooms where id = 15;
-- select * from rounds where room_id = 15 and active = true;
-- select * from get_active_rooms_needing_rounds();
--  select * from get_active_rounds_to_close();

