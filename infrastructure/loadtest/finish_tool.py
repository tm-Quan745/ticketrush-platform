"""Private fixture setup and independent sell-out evidence for the minimum finish run."""
import json
import sys
import time
from pathlib import Path
import tool
from sellout_contract import cohort_complete


def main(command, run_id):
    tool.guard()
    users = json.loads(Path('/data/users.json').read_text())
    admin = json.loads(Path('/data/admin.json').read_text())
    event = tool.uid('HOT')
    prefix = f'ticketrush:loadtest:queue:{event}:'
    cache = tool.redis_client()
    if command == 'seed':
        result = tool.http('POST', f'http://backend:8080/internal/loadtest/events/{event}/waiting-room/seed',
                           token=admin['token'], payload={'users': [u['id'] for u in users]})
        ordered = cache.zrange(prefix+'waiting', 0, -1)
        result['fifo_seed_order'] = ordered == [u['id'] for u in users]
        result['passed'] = result.get('seeded') == 5000 and result['fifo_seed_order']
    else:
        audit = [json.loads(v) for v in cache.lrange(prefix+'admitted:audit',0,-1)]
        ids = [v['user'] for v in audit]
        waiting = cache.zrange(prefix+'waiting',0,-1)
        before = len(audit)
        time.sleep(3)
        after = cache.llen(prefix+'admitted:audit')
        remaining_sold_out = 0
        max_status_ms = 0
        by_id = {u['id']: u for u in users}
        # Check every remaining queued user, not only a sampled client.
        for user_id in waiting:
            start = time.monotonic()
            status = tool.http('GET', f'http://backend:8080/api/v1/events/{event}/waiting-room/status', token=by_id[user_id]['token'])
            max_status_ms = max(max_status_ms, (time.monotonic()-start)*1000)
            remaining_sold_out += status.get('soldOut') is True
        with tool.connect() as db:
            hot = next(row for row in db.execute(tool.SQL_CHECKS['inventory']).fetchall() if str(row['tier_id']) == str(tool.uid('HOT/0')))
            paid = db.execute("SELECT count(*) AS n FROM orders WHERE status='PAID'").fetchone()['n']
        summary = json.loads(Path(f'/results/{run_id}.json').read_text())
        count = lambda name: summary['metrics'].get(name,{}).get('values',{}).get('count',0)
        checks = {
            'hot_sold_equals_capacity': hot['confirmed'] == hot['total'] == 5000,
            'hot_available_zero': hot['available'] == 0,
            'oversell_zero': hot['confirmed'] + hot['held'] <= hot['total'],
            'fifo': ids == [u['id'] for u in users[:len(ids)]],
            'positions': [v['position'] for v in audit] == list(range(1,len(audit)+1)),
            'no_duplicate_admissions': len(ids) == len(set(ids)),
            'admission_stopped': before == after and bool(waiting),
            'remaining_sold_out': remaining_sold_out == len(waiting) and bool(waiting),
            'remaining_status_under_one_second': max_status_ms < 1000,
            'all_tokens_checked_cross_user': count('sellout_token_binding_checked') == len(ids),
            'terminal_cohort': cohort_complete([u['id'] for u in users], ids, waiting, paid,
                                               count('sellout_reservation_sold_out'), remaining_sold_out),
            'work_minimum': count('sellout_started') == count('sellout_finished') == 5000 and count('sellout_paid') == paid and paid > 0,
            'no_errors_or_drops': count('sellout_errors') == count('dropped_iterations') == 0,
        }
        result = {'passed': all(checks.values()), 'checks': checks, 'hot': hot, 'paid_orders': paid,
                  'admitted':len(ids), 'remaining':len(waiting), 'remaining_sold_out':remaining_sold_out,
                  'max_remaining_status_ms':max_status_ms, 'admission_audit':audit}
    Path(f'/results/{run_id}-{command}.json').write_text(json.dumps(result,indent=2,default=str))
    print(json.dumps({k:v for k,v in result.items() if k!='admission_audit'},default=str))
    return 0 if result['passed'] else 1


if __name__ == '__main__':
    sys.exit(main(*sys.argv[1:]))
