create or replace function create_round_from_room(room_id_param int, underlying_contract_round int)
returns table (
  id int,
  room_id int,
  active boolean,
  status round_status,
  round_config jsonb,
  created_at timestamptz,
  updated_at timestamptz
) as $$
declare
    new_round_id int;
    room_record record;
begin
    -- get room data
    select * into room_record
    from rooms
    where rooms.id = room_id_param;

    -- deactivate any active round
    update rounds r
    set    active=false
    where  r.room_id=room_id_param;

    -- insert new round
    insert into rounds (
        room_id,
        active,
        status,
        underlying_contract_round,
        round_config
    )
    values (
        room_id_param,
        true,
        'STARTING',
        underlying_contract_round,
        room_record.room_config
    )
    returning rounds.id into new_round_id;

    -- copy agents from room_agents to rounds_agents
    insert into round_agents (
        round_id,
        agent_id
    )
    select new_round_id,
           ra.agent_id
    from   room_agents ra
    where  ra.room_id=room_id_param;

    -- return the created round
    return query
    select r.id,
           r.room_id,
           r.active,
           r.status,
           r.round_config,
           r.created_at,
           r.updated_at
    from rounds r
    where r.id = new_round_id;
end;
$$ language plpgsql;

