-- Keep the migration audit aligned with the newly canonicalized clinical and
-- field-guidance entities. Lookup and reverse-link values remain derived.
update art_therapy._migration_field_map
set disposition = 'canonical_field', transform_rule = 'copy_preserving_unicode_and_linebreaks', target = case source_field_name
  when '藝術治療工具標題說明' then 'art_therapy.content_field_guidance.field_label_zh'
  when 'Art Therapy Tool Title Description' then 'art_therapy.content_field_guidance.field_label_en'
  when 'MODULE' then 'art_therapy.content_field_guidance.module_label_zh'
  when 'M－英文名稱' then 'art_therapy.content_field_guidance.module_label_en'
  when '建議說明' then 'art_therapy.content_field_guidance.authoring_guidance_zh'
  when '舉例' then 'art_therapy.content_field_guidance.example_zh'
end
where source_table_name = '藝術治療工具標題';

update art_therapy._migration_field_map
set disposition = 'canonical_field', transform_rule = 'copy_preserving_unicode_and_linebreaks', target = 'clinical.clients.' || case source_field_name
  when 'Name' then 'name' when 'Gender' then 'gender' when 'Date of Birth' then 'date_of_birth'
  when 'Contact Info' then 'contact_information' when 'Intake Date' then 'intake_date'
  when 'Diagnosis' then 'diagnosis' when 'Notes' then 'notes' when 'Age' then 'source_age_years'
end
where source_table_name = 'Clients' and source_field_name in ('Name','Gender','Date of Birth','Contact Info','Intake Date','Diagnosis','Notes','Age');

update art_therapy._migration_field_map
set disposition = 'relationship', transform_rule = 'map_record_ids_to_canonical_ids', target = 'clinical.clients.assigned_therapist_id'
where source_table_name = 'Clients' and source_field_name = 'Assigned Therapist';
update art_therapy._migration_field_map
set disposition = 'computed_definition', transform_rule = 'rebuild_from_canonical_relationship_join', target = 'clinical.client_read_model.REVIEW_REQUIRED'
where source_table_name = 'Clients' and source_field_name in ('Appointments','Finance','Assessment Results','Treatment Plans');

update art_therapy._migration_field_map
set disposition = 'canonical_field', transform_rule = 'copy_preserving_unicode_and_linebreaks', target = 'clinical.therapists.' || case source_field_name
  when 'Name' then 'name' when 'Specialty' then 'specialty' when 'License Number' then 'license_number'
  when 'Contact Information' then 'contact_information' when 'Availability' then 'availability' when 'Status' then 'status'
  when 'Profile Photo' then 'profile_attachments' when 'Articles Authored' then 'articles_authored'
  when 'Total Appointments' then 'source_total_appointments' when 'Active Clients' then 'source_active_clients'
  when 'Upcoming Appointments' then 'source_upcoming_appointments' when 'Appointment Summary' then 'appointment_summary'
  when 'Client Feedback Analysis' then 'client_feedback_analysis'
end
where source_table_name = 'Therapists' and source_field_name in ('Name','Specialty','License Number','Contact Information','Availability','Status','Profile Photo','Articles Authored','Total Appointments','Active Clients','Upcoming Appointments','Appointment Summary','Client Feedback Analysis');
update art_therapy._migration_field_map
set disposition = 'computed_definition', transform_rule = 'rebuild_from_canonical_relationship_join', target = 'clinical.therapist_read_model.REVIEW_REQUIRED'
where source_table_name = 'Therapists' and source_field_name in ('Assigned Clients','Scheduled Appointments','Assessment Results');

update art_therapy._migration_field_map
set disposition = 'canonical_field', transform_rule = 'copy_preserving_unicode_and_linebreaks', target = 'clinical.appointments.' || case source_field_name
  when 'Name' then 'name' when 'Date & Time' then 'scheduled_for' when 'Duration' then 'duration_minutes'
  when 'Session Type' then 'session_type' when 'Status' then 'status' when 'Session Notes' then 'session_notes'
  when 'Session Summary' then 'session_summary' when 'Next Action Recommendation' then 'next_action_recommendation'
end
where source_table_name = 'Appointments' and source_field_name in ('Name','Date & Time','Duration','Session Type','Status','Session Notes','Session Summary','Next Action Recommendation');
update art_therapy._migration_field_map
set disposition = 'relationship', transform_rule = 'map_record_ids_to_canonical_ids', target = case source_field_name when 'Client' then 'clinical.appointments.client_id' when 'Therapist' then 'clinical.appointments.therapist_id' end
where source_table_name = 'Appointments' and source_field_name in ('Client','Therapist');
update art_therapy._migration_field_map
set disposition = 'computed_definition', transform_rule = 'rebuild_from_canonical_relationship_join', target = 'clinical.appointment_read_model.REVIEW_REQUIRED'
where source_table_name = 'Appointments' and source_field_name in ('Client Name','Therapist Name');

update art_therapy._migration_field_map
set disposition = 'canonical_field', transform_rule = 'copy_preserving_unicode_and_linebreaks', target = 'clinical.assessment_results.' || case source_field_name
  when 'Name' then 'name' when 'Date Taken' then 'taken_on' when 'Result Summary' then 'result_summary'
  when 'Score' then 'score' when 'Therapist Notes' then 'therapist_notes' when 'Overall Sentiment' then 'overall_sentiment'
  when 'Next Steps Recommendation' then 'next_steps_recommendation'
end
where source_table_name = 'Assessment Results' and source_field_name in ('Name','Date Taken','Result Summary','Score','Therapist Notes','Overall Sentiment','Next Steps Recommendation');
update art_therapy._migration_field_map
set disposition = 'relationship', transform_rule = 'map_record_ids_to_canonical_ids', target = case source_field_name when 'Client' then 'clinical.assessment_results.client_id' when 'Therapists' then 'clinical.assessment_result_therapists' end
where source_table_name = 'Assessment Results' and source_field_name in ('Client','Therapists');
update art_therapy._migration_field_map
set disposition = 'computed_definition', transform_rule = 'rebuild_from_canonical_relationship_join', target = 'clinical.assessment_result_read_model.REVIEW_REQUIRED'
where source_table_name = 'Assessment Results' and source_field_name in ('Client Diagnosis','Therapist Name');

update art_therapy._migration_field_map
set disposition = 'canonical_field', transform_rule = 'copy_preserving_unicode_and_linebreaks', target = 'clinical.treatment_plans.' || case source_field_name
  when 'Diagnosis' then 'diagnosis' when 'Goals' then 'goals' when 'Interventions' then 'interventions'
  when 'Start Date' then 'start_date' when 'Progress Notes' then 'progress_notes' when 'Progress Summary' then 'progress_summary'
  when 'Suggested Next Steps' then 'suggested_next_steps'
end
where source_table_name = 'Treatment Plans' and source_field_name in ('Diagnosis','Goals','Interventions','Start Date','Progress Notes','Progress Summary','Suggested Next Steps');
update art_therapy._migration_field_map
set disposition = 'relationship', transform_rule = 'map_record_ids_to_canonical_ids', target = 'clinical.treatment_plans.client_id'
where source_table_name = 'Treatment Plans' and source_field_name = 'Client';
update art_therapy._migration_field_map
set disposition = 'computed_definition', transform_rule = 'rebuild_from_canonical_relationship_join', target = 'clinical.treatment_plan_read_model.REVIEW_REQUIRED'
where source_table_name = 'Treatment Plans' and source_field_name = 'Client Name';

update art_therapy._migration_field_map
set disposition = 'canonical_field', transform_rule = 'copy_preserving_unicode_and_linebreaks', target = 'clinical.finance_transactions.' || case source_field_name
  when 'Transaction Description' then 'transaction_description' when 'Transaction Type' then 'transaction_type'
  when 'Transaction Date' then 'transaction_date' when 'Transaction Category' then 'transaction_category'
  when 'Transaction Amount' then 'transaction_amount' when 'Payment Method' then 'payment_method'
  when 'Transaction Status' then 'transaction_status' when 'Client Transaction Summary' then 'client_transaction_summary'
end
where source_table_name = 'Finance' and source_field_name in ('Transaction Description','Transaction Type','Transaction Date','Transaction Category','Transaction Amount','Payment Method','Transaction Status','Client Transaction Summary');
update art_therapy._migration_field_map
set disposition = 'relationship', transform_rule = 'map_record_ids_to_canonical_ids', target = 'clinical.finance_transactions.client_id'
where source_table_name = 'Finance' and source_field_name = 'Related Client';
