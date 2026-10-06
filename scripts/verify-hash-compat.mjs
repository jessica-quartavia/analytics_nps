import crypto from 'crypto';
import {
  OFFICIAL_TOPICS,
  VOC_GEMINI_PROMPT_VERSION,
  VOC_GEMINI_CLASSIFIER_VERSION,
  VOC_GEMINI_MODEL,
} from './n8n-voc-native-gemini-nodes.mjs';

const PROMPT_VERSION = VOC_GEMINI_PROMPT_VERSION;
const CLASSIFIER_VERSION = VOC_GEMINI_CLASSIFIER_VERSION;
const MODEL = VOC_GEMINI_MODEL;

function sha(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function buildHashes(answer_text, score, nps_category) {
  const hash_input_json = JSON.stringify({
    question: 'Comentário NPS',
    answer: answer_text,
    candidate_themes: [...OFFICIAL_TOPICS].sort(),
    prompt_version: PROMPT_VERSION,
    model: MODEL,
    classifier_version: CLASSIFIER_VERSION,
  });
  const hash_answer_json = JSON.stringify({
    question_key: 'nps_comment',
    answer_text,
    score: score != null ? Number(score) : null,
    nps_category,
  });
  return {
    hash_input_json,
    hash_answer_json,
    input_hash: sha(hash_input_json),
    answer_hash: sha(hash_answer_json),
  };
}

const prodRows = [
  {
    id: '3f54e050-ae45-4490-b729-104ac28b7fc2',
    score: '9',
    nps_category: 'Promotor',
    stored_answer_hash: '920c1906abbcdc69f309f435ff758d90a51a276fc426e3f0beab467433fdb734',
    stored_input_hash: '27dd1762950975badbfe8becc13c4de8ac53946fd3bb18c9889271d89d905d44',
    answer_text: `Qual o principal motivo da sua nota?: Acompanhante e conteúdo

Qual a principal razão para a sua nota 9 ou 10? O que mais te agradou em sua experiência?: Acompanhante com a equipe

O que te faria continuar com a gente por mais 5 anos sem hesitar?: Chegarmos em um acordo que faça sentido no investimento x retorno considerando meu momento atual

Você gostaria de adicionar algum outro comentário sobre a sua experiência com a QuartaVia?: Não`,
  },
  {
    id: '8e1b0eaa-19b0-44ee-8daf-7ba1ea2418c6',
    score: '10',
    nps_category: 'Promotor',
    stored_answer_hash: '4dae31770df9260473ab69ac4fae32110ffc9726112c573a5a20918015d2227f',
    stored_input_hash: 'bf9bda96e2008903f4e18a5f7760d4c75fd313584b442f9a6ca004ebf66f2778',
    answer_text: `Qual o principal motivo da sua nota?: Conhecimento exclusivo

Qual a principal razão para a sua nota 9 ou 10? O que mais te agradou em sua experiência?: Proximidade e disponibilidade do Eduardo

O que te faria continuar com a gente por mais 5 anos sem hesitar?: Clareza no que estou construindo/ganhando

Você gostaria de adicionar algum outro comentário sobre a sua experiência com a QuartaVia?: Melhorar valores/ganhos`,
  },
  {
    id: '5e4c1eb6-b8db-4cf7-af34-e3a21e04cc8b',
    score: '10',
    nps_category: 'Promotor',
    stored_answer_hash: '1efa90a3a8ea8ac02e537c963e73b5c18a36af84b94edebd50bb650b47352e23',
    stored_input_hash: null,
    answer_text: `Qual o principal motivo da sua nota?: Acessoria  próxima que mostra o que fazer pra se ter liberdade financeira

Qual a principal razão para a sua nota 9 ou 10? O que mais te agradou em sua experiência?: Perceber o interesse e compromisso da empresa ao orientar / sugerir o que fazer com o dinheiro

O que te faria continuar com a gente por mais 5 anos sem hesitar?: Colecionar mais ativos

Você gostaria de adicionar algum outro comentário sobre a sua experiência com a QuartaVia?: Que continuem próximos, disponíveis e transmitindo confiança`,
  },
];

console.log('=== Prod hash compatibility (Node === Prepare logic) ===');
let ok = true;
for (const row of prodRows) {
  const h = buildHashes(row.answer_text, row.score, row.nps_category);
  const ansMatch = h.answer_hash === row.stored_answer_hash;
  const inMatch = row.stored_input_hash == null || h.input_hash === row.stored_input_hash;
  if (!ansMatch || !inMatch) ok = false;
  console.log(row.id.slice(0, 8), {
    answer_hash_match: ansMatch,
    input_hash_match: inMatch,
    computed_answer: h.answer_hash.slice(0, 16),
    stored_answer: row.stored_answer_hash.slice(0, 16),
  });
}

const stress = [
  'Gostei, mas faltou acompanhamento.',
  'Cliente disse: "ótimo atendimento".',
  'Foi bom,\nmas poderia melhorar.',
];
console.log('\n=== Stress samples (local SHA) ===');
for (const answer of stress) {
  const h = buildHashes(answer, 8, 'Neutro');
  console.log(JSON.stringify(answer.slice(0, 40)), h.input_hash.slice(0, 16), h.answer_hash.slice(0, 16));
}

process.exit(ok ? 0 : 1);
