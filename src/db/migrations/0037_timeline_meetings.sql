DROP VIEW "public"."timeline";--> statement-breakpoint
CREATE VIEW "public"."timeline" AS (
  select
    a.owner_id,
    'activity'::text as event_type,
    a.id as event_id,
    a.occurred_at,
    a.kind,
    a.direction,
    a.title,
    a.body,
    a.outcome,
    a.organization_id,
    array(
      select ac.contact_id from activity_contacts ac where ac.activity_id = a.id
    ) as contact_ids,
    null::uuid as material_id,
    null::text as status
  from activities a
  union all
  select
    s.owner_id,
    'material_send'::text as event_type,
    s.id as event_id,
    s.sent_at as occurred_at,
    s.channel as kind,
    null::text as direction,
    m.name::text || ' · ' || v.label as title,
    s.note as body,
    null::text as outcome,
    s.organization_id,
    array(
      select r.contact_id from material_send_recipients r where r.send_id = s.id
    ) as contact_ids,
    m.id as material_id,
    s.status
  from material_sends s
  join material_versions v on v.id = s.version_id
  join materials m on m.id = v.material_id
  union all
  select
    e.owner_id,
    'calendar_event'::text as event_type,
    e.id as event_id,
    case
      when e.all_day then (e.starts_on + time '12:00') at time zone 'UTC'
      else e.starts_at
    end as occurred_at,
    case when e.all_day then 'all_day' else 'meeting' end as kind,
    null::text as direction,
    e.title,
    e.location as body,
    null::text as outcome,
    e.organization_id,
    array(
      select ec.contact_id from calendar_event_contacts ec where ec.event_id = e.id
    ) as contact_ids,
    null::uuid as material_id,
    null::text as status
  from calendar_events e
  where e.starts_at <= now() or e.starts_on <= current_date
);