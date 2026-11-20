| section | step | expected | got | ok | note |
|---|---|---|---|---|---|
| S1 Jev#3 demotion | before: target (admin) GET /work/queue?group=dispatcher | 200 | 200 | yes |  |
| S1 Jev#3 demotion | before: target (admin) GET /admin/users | 200 | 200 | yes |  |
| S1 Jev#3 demotion | admin demotes target to document_reviewer (PATCH /admin/users/:id/change-role) | 200 | 200 | yes | row: document_reviewer, groups: system_admin_dtam |
| S1 Jev#3 demotion | target old token after demotion: GET /work/my | 401 | 401 | yes | session epoch |
| S1 Jev#3 demotion | demoted re-signs in (1.5 s after the revocation stamp) | yes | yes | yes |  |
| S1 Jev#3 demotion | demoted GET /admin/users (role gate) | 403 | 403 | yes |  |
| S1 Jev#3 demotion | demoted GET /work/queue?group=dispatcher | 403 | 403 | yes | a document_reviewer without the admin group gets 403 |
| S1 Jev#3 demotion | demoted GET /work/queue?group=field_inspector | 403 | 403 | yes |  |
| S1 Jev#3 demotion | demoted GET /work/my lists the open dispatcher item | false | false | yes |  |
| S1 Jev#3 demotion | demoted GET /work/:id of the dispatcher's claimed item | 404 | 404 | yes |  |
| S1 Jev#3 demotion | demoted POST /work/:id/done on the dispatcher's claimed item | 400 | 400 | yes | row after: {"state":"CLAIMED","assignedUserId":"dispatcher","completedBy":null} |
| S1 Jev#3 demotion | demoted POST /work/:id/claim on field_inspector work | 400 | 400 | yes | row after: {"state":"TODO","assignedUserId":null,"completedBy":null} |
| S1 Jev#3 demotion | control document_reviewer GET /work/queue?group=dispatcher | 403 | 403 | yes |  |
| S1 Jev#3 demotion | control document_reviewer POST /work/:id/claim on field_inspector work | 400 | 400 | yes |  |
| S1 Jev#3 demotion | control document_reviewer POST /work/:id/done on open dispatcher work | 400 | 400 | yes |  |
| S1 Jev#3 demotion | variant: admin WITHOUT a membership row is demoted | 200 | 200 | yes | groups: (none) |
| S1 Jev#3 demotion | variant: demoted (no membership) GET /work/queue?group=dispatcher | 403 | 403 | yes | role fallback only |
| S1 Jev#3 demotion | variant B: admin WITH the admin group is demoted to dispatcher | 200 | 200 | yes | row: dispatcher, groups: system_admin_dtam |
| S1 Jev#3 demotion | variant B: demoted GET /admin/users (role gate) | 403 | 403 | yes |  |
| S1 Jev#3 demotion | variant B: demoted GET /work/queue?group=field_inspector | 403 | 403 | yes | items listed: 0 |
| S1 Jev#3 demotion | variant B: demoted GET /work/:id of field_inspector work | 403 | 403 | yes |  |
| S1 Jev#3 demotion | variant B: demoted POST /work/:id/done on the dispatcher's claimed item | 400 | 400 | yes | row after: {"state":"CLAIMED","assignedUserId":"dispatcher","completedBy":null} |
| S1 Jev#3 demotion | variant B: demoted POST /work/:id/claim on field_inspector work | 400 | 400 | yes | row after: {"state":"TODO","assignedUserId":null,"completedBy":null} |
| S1 Jev#3 demotion | control plain dispatcher GET /work/queue?group=field_inspector | 403 | 403 | yes |  |
| S1 Jev#3 demotion | control plain dispatcher POST /work/:id/done on another's claimed item | 400 | 400 | yes | row after: {"state":"CLAIMED","assignedUserId":"reviewer","completedBy":null} |
| S1 Jev#3 demotion | control plain dispatcher POST /work/:id/claim on field_inspector work | 400 | 400 | yes |  |
| S5 Jev#4 last-admin race | DTAM: two admins disable each other at once, 100 trials: both 200 | 0/100 | 0/100 | yes |  |
| S5 Jev#4 last-admin race | DTAM: outcomes over 100 trials | - | {"200 / 409 ROLE_ADMIN_CANNOT_BE_LAST":100} |  |  |
| S5 Jev#4 last-admin race | DTAM: trials ending with ZERO active admins in the organization | 0/100 | 0/100 | yes | guard intends 0 |
| S5 Jev#4 last-admin race | platform: two platform admins delete each other at once, 100 trials: both 200 | 0/100 | 0/100 | yes |  |
| S5 Jev#4 last-admin race | platform: outcomes over 100 trials | - | {"200 / 409 ROLE_ADMIN_CANNOT_BE_LAST":100} |  |  |
| S5 Jev#4 last-admin race | platform: trials ending with ZERO active platform admins | 0/100 | 0/100 | yes | guard intends 0 |
| S5 Jev#4 last-admin race | sequential control: a disables b (2 admins left) | 200 | 200 | yes |  |
| S5 Jev#4 last-admin race | sequential control: c disables a (c is the last) | 200 | 200 | yes |  |
| S5 Jev#4 last-admin race | sequential control: a (now disabled) token on the door | 401 | 401 | yes | disabled session rejected |
