| section | step | expected | got | ok | note |
|---|---|---|---|---|---|
| S8 promotion keeps a leftover group | admin promotes a dispatcher holding the dispatcher row to system_admin_dtam | 200 | 200 | yes | row: system_admin_dtam, groups: dispatcher |
| S8 promotion keeps a leftover group | promoted GET /admin/users (role gate) | 200 | 200 | yes |  |
| S8 promotion keeps a leftover group | promoted GET /work/queue?group=field_inspector | - | 403 |  | the leftover dispatcher row hides the role fallback |
| S8 promotion keeps a leftover group | promoted POST /work/:id/claim on field_inspector work | - | 400 |  |  |
