insert into permissions (resource_type, action, risk_level, description)
values
  ('site', 'read', 'low', 'Read site'),
  ('site', 'create', 'medium', 'Create site'),
  ('site', 'update', 'medium', 'Update site'),
  ('site', 'deploy', 'high', 'Deploy site'),
  ('workflow', 'execute', 'medium', 'Execute workflow'),
  ('approval', 'approve', 'high', 'Approve high-risk action')
on conflict do nothing;

