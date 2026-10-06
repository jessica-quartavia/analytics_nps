-- Compute Voc Hashes — antes (CSV frágil)
SELECT encode(digest($1::text, 'sha256'), 'hex') AS input_hash,
       encode(digest($2::text, 'sha256'), 'hex') AS answer_hash;
-- queryReplacement:
-- ={{ $('Prepare VoC Input').item.json.hash_input_json }},={{ $('Prepare VoC Input').item.json.hash_answer_json }}
