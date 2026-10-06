WITH payload AS (
  SELECT *
  FROM jsonb_to_record($1::jsonb) AS x(
    hash_input_json text,
    hash_answer_json text
  )
)
SELECT
  encode(digest(x.hash_input_json, 'sha256'), 'hex') AS input_hash,
  encode(digest(x.hash_answer_json, 'sha256'), 'hex') AS answer_hash
FROM payload x;