"""Bounded init diagnostic and one sell-out run; never retries automatically."""
import argparse
import json
import time
from types import SimpleNamespace
import loadtest as lt


def arguments(run_id):
    return SimpleNamespace(users=5000, background=200, capacity=5000, waiting=True, queue_closed=True,
        run_id=run_id, backend_image=None, backend_commit=None, param=['PRE_VUS=100','MAX_VUS=150'])


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('mode',choices=['prepare','init','sellout'])
    parser.add_argument('--run-id',required=True)
    parser.add_argument('--vus',type=int,default=100)
    parser.add_argument('--materialize',action='store_true')
    args=parser.parse_args()
    config=arguments(args.run_id)
    if args.mode=='prepare':
        lt.reset(config)
        return 0
    if args.mode=='init' and args.vus not in (25,50,100):
        parser.error('init VUs must be 25, 50 or 100')
    provenance=lt.backend_provenance(config)
    (lt.RESULTS/f'{args.run_id}-provenance.json').write_text(json.dumps(provenance,indent=2))
    if args.mode=='sellout':
        lt.reset(config)
        lt.compose('run','--rm','-T','--entrypoint','python','tools','finish_tool.py','seed',args.run_id)
        lt.queue_config(20,args.run_id)
        lt.tool('queue-open','--output',args.run_id+'-queue-open.json')
    sampler=lt.DockerStatsSampler(args.run_id)
    sampler.start()
    script='init-memory.js' if args.mode=='init' else 'sellout.js'
    command=lt.COMPOSE+['run','--rm','-T','-e',f'RUN_ID={args.run_id}',
        '-e',f'PRE_VUS={args.vus if args.mode=="init" else 100}','-e','MAX_VUS=150',
        '-e',f'MATERIALIZE={str(args.materialize).lower()}','k6','run',script]
    start=time.time()
    try:
        outcome=lt.run(command,check=False)
    finally:
        sampler.finish()
    result={'run_id':args.run_id,'mode':args.mode,'k6_exit':outcome.returncode,'duration_seconds':time.time()-start,
        'memory_abort':sampler.memory_abort.is_set(),'max_memory_percent':sampler.max_memory_percent,
        'pre_vus':args.vus if args.mode=='init' else 100,'max_vus':150,
        'materialize':args.materialize,'passed':outcome.returncode==0 and not sampler.memory_abort.is_set()}
    if args.mode=='sellout':
        result['verifier_exit']=lt.tool('verify','--drain','180','--output',args.run_id+'-verify.json',check=False).returncode
        result['audit_exit']=lt.compose('run','--rm','-T','--entrypoint','python','tools','finish_tool.py','audit',args.run_id,check=False).returncode
        result['passed']=result['passed'] and result['verifier_exit']==result['audit_exit']==0
    (lt.RESULTS/f'{args.run_id}-run.json').write_text(json.dumps(result,indent=2))
    return 0 if result['passed'] else 1


if __name__=='__main__':
    raise SystemExit(main())
