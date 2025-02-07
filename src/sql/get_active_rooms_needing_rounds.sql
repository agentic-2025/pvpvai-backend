CREATE OR REPLACE FUNCTION get_active_rooms_needing_rounds()
RETURNS TABLE(id int, active boolean, contract_address text, room_config jsonb) AS $$
BEGIN
    RETURN QUERY

    SELECT rooms.id, rooms.active, rooms.contract_address, rooms.room_config
    FROM   rooms
    WHERE  rooms.active = true
           and not exists (
                select 1
                from rounds
                where rounds.room_id = rooms.id
              --   and rounds.status = 'STARTING'
                and rounds.active = true
           )
           and rooms.contract_address is not null;

       --     AND (
              --   rooms.contract_address is not null

                OR (rounds.status = 'STARTING'  AND rounds.active=TRUE AND rounds.updated_at < NOW() - INTERVAL '60 seconds')
       --      );
END;
$$ LANGUAGE plpgsql;

--  select * from get_active_rooms_needing_rounds();