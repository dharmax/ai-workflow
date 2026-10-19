#!/usr/bin/env python3
import subprocess,json,shlex,pathlib,hashlib,os
cli=shlex.split(os.environ.get('AIWF_COMMAND','aiwf'))
logpath=pathlib.Path('.ai-workflow/generated/iteration1-journey.log')
logpath.parent.mkdir(parents=True,exist_ok=True)
log=logpath.open('w')
def run(*args):
    log.write('$ '+shlex.join(['aiwf',*args])+'\n');log.flush()
    r=subprocess.run(cli+list(args),text=True,capture_output=True,timeout=45)
    log.write(r.stdout+r.stderr+'\n');log.flush()
    if r.returncode: raise RuntimeError('Public command failed: '+shlex.join(args)+'\n'+r.stdout+r.stderr)
    return json.loads(r.stdout) if r.stdout.lstrip().startswith(('{','[')) else r.stdout
run('init')
run('move','TKT-001','Backlog')
run('product','define','--title','Ledger CLI','--purpose','Summarize finite numeric ledger entries from a terminal','--scope','One invocation over explicit numbers; no network or accounts','--actor','Terminal user','--status','accepted','--yes')
run('product','goal','new','--id','G-SUMMARIES','--title','Trustworthy numeric summaries','--body','Users can calculate totals and means with observable output and errors.','--status','accepted','--yes')
run('product','concept','new','--id','C-ENTRY','--title','Ledger entry','--body','A finite numeric value; a decimal fraction remains part of its value.','--status','accepted','--yes')
for id,title,body in [('F-TOTAL','Ledger total','Total the numeric entries supplied by a terminal user, preserving their values.'),('F-MEAN','Ledger mean','Report the arithmetic mean of supplied finite numeric entries.')]:
    run('product','feature','new','--id',id,'--title',title,'--body',body,'--status','accepted','--yes')
run('product','aspect','new','--id','A-NUMERIC','--title','Numeric integrity','--body','Finite decimal values retain their fractions. Invalid input produces a nonzero exit and no numeric result.','--criterion','Decimal fractions survive the public invocation.','--status','accepted','--yes')
for id,title,action,result,intent in [('S-TOTAL','Total decimal entries','Invoke ledger total 1.5 2.5','Exit 0 and print 4 on stdout','Obtain a correct total for decimal ledger entries'),('S-MEAN','Average ledger entries','Invoke ledger mean 2 4','Exit 0 and print 3 on stdout','Obtain the arithmetic mean without a separate calculation')]:
    run('product','story','new','--id',id,'--title',title,'--actor','Terminal user','--intent',intent,'--initial-state','The Ledger CLI is executable; no persistent data or network is required.','--action',action,'--expected-result',result,'--exceptions','Invalid numeric input exits 2, prints a diagnostic, and prints no numeric result.','--bounds','One invocation with at least one finite numeric input.','--criterion',result,'--status','accepted','--yes')
for target in ['G-SUMMARIES','C-ENTRY','F-TOTAL','F-MEAN']:run('link','PRODUCT','to',target,'as','contains','--yes')
for feature,story in [('F-TOTAL','S-TOTAL'),('F-MEAN','S-MEAN')]:
    run('link',feature,'to',story,'as','enables','--yes')
    run('link','A-NUMERIC','to',story,'as','applies_to','--yes')
    run('link','C-ENTRY','to',feature,'as','governs','--yes')
run('rule','list')
run('product','epic','new','--id','E-MEAN','--title','Deliver ledger mean','--body','Reviewed example delivery of the accepted mean Story; automatic provider-backed derivation remains blocked by account authentication/quota.','--status','planned','--yes')
run('ticket','new','--id','T-MEAN','--title','Implement ledger mean command','--body','Implement the accepted S-MEAN public behavior; preserve invalid-input behavior.','--criterion','mean 2 4 exits 0 and prints 3')
run('link','E-MEAN','to','F-MEAN','as','targets','--yes')
run('link','E-MEAN','to','T-MEAN','as','contains','--yes')
run('link','T-MEAN','to','S-MEAN','as','addresses','--yes')
run('link','T-MEAN','to','src/cli.ts','as','modifies','--yes')
run('bug','new','--id','B-TOTAL','--title','Decimal totals are truncated','--priority','P1')
assert run('bug','triage','B-TOTAL')['ready'] is False
run('bug','edit','B-TOTAL','--reproduction','bun src/cli.ts total 1.5 2.5','--expected','Exit 0; stdout 4','--actual','Exit 0; stdout 3','--severity','high','--environment','Bun 1.3.14 on Linux','--impact','Decimal numeric values are lost','--evidence','src/cli.ts','--criterion','total 1.5 2.5 exits 0 and prints 4')
run('link','B-TOTAL','to','S-TOTAL','as','addresses','--yes')
run('link','B-TOTAL','to','F-TOTAL','as','implements','--yes')
run('link','B-TOTAL','to','src/cli.ts','as','modifies','--yes')
initial=hashlib.sha256(pathlib.Path('src/cli.ts').read_bytes()).hexdigest()
for story,work,command,values,expected in [('S-MEAN','T-MEAN','mean',['2','4'],'3'),('S-TOTAL','B-TOTAL','total',['1.5','2.5'],'4')]:
    file='tests/'+command+'.test.ts'
    body='const result=subject('+json.dumps([command,*values])+'); expect(result.exitCode).toBe(0); expect(result.stdout.trim()).toBe('+json.dumps(expected)+'); const invalid=subject(['+json.dumps(command)+',"invalid"]); expect(invalid.exitCode).toBe(2); expect(invalid.stdout).toBe("");'
    spec=[story,'--file',file,'--fixture','src/public.ts','--interface','invoke','--body',body]
    for review in range(2):
        preview=run('story-test','prepare',*spec)
        assert preview['status']=='review',preview
        applied=run('story-test','apply',*spec,'--fingerprint',preview['fingerprint'],'--yes')
        if applied['status']=='linked':break
        assert applied['status']=='file-created-unlinked',applied
    assert applied['status']=='linked',applied
    status=run('story-test','status',story);assert status['state']=='skipped',status
    if work.startswith('B-'): run('bug','start',work,'--agent','codex-i1')
    else:run('claim',work,'codex-i1')
    observed=run('story-test','run',story)
    log.write('OBSERVED '+json.dumps(observed)+'\n');log.flush()
    assert run('story-test','status',story)['state']=='expected-red'
    run('release',work)
    run('move',work,'Blocked')
assert initial==hashlib.sha256(pathlib.Path('src/cli.ts').read_bytes()).hexdigest()
run('product','export')
run('sync')
run('bugs')
run('ticket','show','T-MEAN')
run('doctor')
print(json.dumps({'root':str(pathlib.Path.cwd()),'sourceHash':initial,'featureStory':'S-MEAN','bugStory':'S-TOTAL','result':'Both public tests observed expected-red; no feature or bug fix implemented; no Done or receipt.'}))
