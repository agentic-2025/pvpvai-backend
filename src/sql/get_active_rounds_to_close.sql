-- drop function if exists get_active_rounds_to_close;
CREATE OR REPLACE FUNCTION get_active_rounds_to_close()
RETURNS TABLE(id int, active boolean, room_config jsonb, room_id int, contract_address text) AS $$
BEGIN
    RETURN QUERY

    SELECT  rounds.id, rounds.active, rounds.round_config, rooms.id as room_id, rooms.contract_address

    FROM    rounds
            inner join rooms on rooms.id = rounds.room_id

    WHERE   rounds.active = true
            and (
              rounds.status = 'OPEN' and NOW() > (rounds.created_At + (rounds.round_config->>'round_duration')::interval)
              OR
              (rounds.status = 'CLOSING'  AND rounds.updated_at < NOW() - INTERVAL '30 seconds')
            );
END;
$$ LANGUAGE plpgsql;

--  select * from get_active_rounds_to_close();
-- update rounds set status = 'OPEN', active = true where id = 448;
-- select * from rounds where room_id = 15 and active = true;
