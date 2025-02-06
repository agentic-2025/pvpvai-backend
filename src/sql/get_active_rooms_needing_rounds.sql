CREATE OR REPLACE FUNCTION get_active_rooms_needing_rounds()
RETURNS TABLE(id int, active boolean, contract_address text, room_config jsonb) AS $$
BEGIN
    RETURN QUERY

    SELECT rooms.id, rooms.active, rooms.contract_address, rooms.room_config
    FROM   rooms
           LEFT JOIN rounds ON rooms.id = rounds.room_id
    WHERE  rooms.active = true
           AND (
                rounds.id is null
                and
                rooms.contract_address is not null

                -- OR
                -- (rounds.status = 'STARTING'  AND rounds.active=TRUE AND rounds.updated_at < NOW() - INTERVAL '60 seconds')
            );
END;
$$ LANGUAGE plpgsql;
