#!/usr/bin/env python3
"""Gera SQL idempotente para carga nps_historico (Business Data)."""
from __future__ import annotations

import hashlib
import json
import math
import re
from pathlib import Path

import pandas as pd

REPO = Path(__file__).resolve().parents[2]
CSV = REPO / "NPS_PHARUS_consolidado.csv"
XLSX = REPO / "NPS_PHARUS_consolidado_todas_medicoes.xlsx"
OUT = Path(__file__).resolve().parent / "out" / "nps_historico_import.sql"

CICLOS_MEDICAO = {"2025-Q2", "2025-Q3", "2025-Q4", "2026-Q1", "2026-Q2", "2026-Q3"}


def sql_str(v) -> str:
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return "NULL"
    s = str(v)
    return "'" + s.replace("'", "''") + "'"


def sql_num(v) -> str:
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return "NULL"
    try:
        f = float(v)
        if math.isnan(f):
            return "NULL"
        return str(f)
    except (TypeError, ValueError):
        return "NULL"


def sql_int(v) -> str:
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return "NULL"
    try:
        return str(int(float(v)))
    except (TypeError, ValueError):
        return "NULL"


def sql_ts(v) -> str:
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return "NULL"
    s = str(v).strip()
    if not s or s.lower() == "nan":
        return "NULL"
    s = s.replace(" ", "T", 1) if " " in s and "T" not in s else s
    return sql_str(s) + "::timestamptz"


def chave_resposta(row) -> str:
    idr = row.get("id_resposta")
    if pd.notna(idr) and str(idr).strip():
        return str(idr).strip()
    payload = "|".join(
        str(row.get(c, "") or "")
        for c in ("ciclo", "data_resposta", "cliente", "nota_nps", "fonte_arquivo", "fonte_aba")
    )
    return "hash:" + hashlib.sha256(payload.encode("utf-8")).hexdigest()


def sheet_name(xl: pd.ExcelFile, prefix: str) -> str:
    for n in xl.sheet_names:
        if n.lower().startswith(prefix.lower()):
            return n
    raise SystemExit(f"sheet not found: {prefix}")


def main() -> None:
    if not CSV.is_file() or not XLSX.is_file():
        raise SystemExit("Missing NPS_PHARUS source files in repo root")

    df = pd.read_csv(CSV)
    xl = pd.ExcelFile(XLSX)

    respostas_cols = [
        "chave_import",
        "ciclo",
        "ciclo_nome",
        "data_resposta",
        "cliente",
        "id_cliente",
        "programa",
        "ep",
        "nota_nps",
        "categoria",
        "nota_estrategista",
        "nota_backoffice",
        "nota_qv360",
        "nota_arquitetura_patrimonial",
        "plano_patrimonial",
        "plano_apresentado",
        "caminho",
        "momento",
        "motivo_nota",
        "melhoria",
        "razao_positiva",
        "retencao_5_anos",
        "comentario_adicional",
        "reunioes_realizadas",
        "inicio_programa",
        "versao_formulario",
        "fonte_arquivo",
        "fonte_aba",
        "id_resposta",
        "ref_programa",
        "ref_ep",
    ]

    lines: list[str] = [
        "BEGIN;",
        "DELETE FROM nps_historico.excluidos WHERE id IS NOT NULL;",
        "DELETE FROM nps_historico.arquivos_recebidos WHERE id IS NOT NULL;",
    ]

    for _, row in df.iterrows():
        vals = [
            sql_str(chave_resposta(row)),
            sql_str(row.get("ciclo")),
            sql_str(row.get("ciclo_nome")),
            sql_ts(row.get("data_resposta")),
            sql_str(row.get("cliente")),
            sql_str(row.get("id_cliente")),
            sql_str(row.get("programa")),
            sql_str(row.get("ep")),
            sql_num(row.get("nota_nps")),
            sql_str(row.get("categoria")),
            sql_num(row.get("nota_estrategista")),
            sql_num(row.get("nota_backoffice")),
            sql_num(row.get("nota_qv360")),
            sql_num(row.get("nota_arquitetura_patrimonial")),
            sql_str(row.get("plano_patrimonial")),
            sql_str(row.get("plano_apresentado")),
            sql_str(row.get("caminho")),
            sql_str(row.get("momento")),
            sql_str(row.get("motivo_nota")),
            sql_str(row.get("melhoria")),
            sql_str(row.get("razao_positiva")),
            sql_str(row.get("retencao_5_anos")),
            sql_str(row.get("comentario_adicional")),
            sql_str(row.get("reunioes_realizadas")),
            sql_str(row.get("inicio_programa")),
            sql_str(row.get("versao_formulario")),
            sql_str(row.get("fonte_arquivo")),
            sql_str(row.get("fonte_aba")),
            sql_str(row.get("id_resposta")),
            sql_str(row.get("ref_programa")),
            sql_str(row.get("ref_ep")),
        ]
        col_list = ", ".join(respostas_cols)
        lines.append(
            f"INSERT INTO nps_historico.respostas ({col_list}) VALUES ({', '.join(vals)}) "
            f"ON CONFLICT (chave_import) DO UPDATE SET ciclo = EXCLUDED.ciclo, ciclo_nome = EXCLUDED.ciclo_nome, "
            f"data_resposta = EXCLUDED.data_resposta, cliente = EXCLUDED.cliente, id_cliente = EXCLUDED.id_cliente, "
            f"programa = EXCLUDED.programa, ep = EXCLUDED.ep, nota_nps = EXCLUDED.nota_nps, categoria = EXCLUDED.categoria, "
            f"nota_estrategista = EXCLUDED.nota_estrategista, nota_backoffice = EXCLUDED.nota_backoffice, "
            f"nota_qv360 = EXCLUDED.nota_qv360, nota_arquitetura_patrimonial = EXCLUDED.nota_arquitetura_patrimonial, "
            f"plano_patrimonial = EXCLUDED.plano_patrimonial, plano_apresentado = EXCLUDED.plano_apresentado, "
            f"caminho = EXCLUDED.caminho, momento = EXCLUDED.momento, motivo_nota = EXCLUDED.motivo_nota, "
            f"melhoria = EXCLUDED.melhoria, razao_positiva = EXCLUDED.razao_positiva, retencao_5_anos = EXCLUDED.retencao_5_anos, "
            f"comentario_adicional = EXCLUDED.comentario_adicional, reunioes_realizadas = EXCLUDED.reunioes_realizadas, "
            f"inicio_programa = EXCLUDED.inicio_programa, versao_formulario = EXCLUDED.versao_formulario, "
            f"fonte_arquivo = EXCLUDED.fonte_arquivo, fonte_aba = EXCLUDED.fonte_aba, id_resposta = EXCLUDED.id_resposta, "
            f"ref_programa = EXCLUDED.ref_programa, ref_ep = EXCLUDED.ref_ep, imported_at = now();"
        )

    resumo = pd.read_excel(xl, sheet_name=sheet_name(xl, "Resumo"), header=None)
    for _, row in resumo.iterrows():
        ciclo = row.iloc[0]
        if pd.isna(ciclo) or str(ciclo).strip() not in CICLOS_MEDICAO:
            continue
        c = str(ciclo).strip()
        lines.append(
            "INSERT INTO nps_historico.medicoes (ciclo, medicao, janela_datas, respostas, promotores, neutros, "
            "detratores, pct_promotores, pct_detratores, nps, nota_media, painel_oficial_respostas, painel_oficial_nps) "
            f"VALUES ({sql_str(c)}, {sql_str(row.iloc[1])}, {sql_str(row.iloc[2])}, {sql_int(row.iloc[3])}, "
            f"{sql_int(row.iloc[4])}, {sql_int(row.iloc[5])}, {sql_int(row.iloc[6])}, {sql_num(row.iloc[7])}, "
            f"{sql_num(row.iloc[8])}, {sql_num(row.iloc[9])}, {sql_num(row.iloc[10])}, {sql_int(row.iloc[11])}, "
            f"{sql_num(row.iloc[12])}) ON CONFLICT (ciclo) DO UPDATE SET medicao = EXCLUDED.medicao, "
            "janela_datas = EXCLUDED.janela_datas, respostas = EXCLUDED.respostas, promotores = EXCLUDED.promotores, "
            "neutros = EXCLUDED.neutros, detratores = EXCLUDED.detratores, pct_promotores = EXCLUDED.pct_promotores, "
            "pct_detratores = EXCLUDED.pct_detratores, nps = EXCLUDED.nps, nota_media = EXCLUDED.nota_media, "
            "painel_oficial_respostas = EXCLUDED.painel_oficial_respostas, painel_oficial_nps = EXCLUDED.painel_oficial_nps, "
            "imported_at = now();"
        )

    arq = pd.read_excel(xl, sheet_name=sheet_name(xl, "Arquivos"))
    for _, row in arq.iterrows():
        lines.append(
            "INSERT INTO nps_historico.arquivos_recebidos (arquivo_recebido, tipo, conteudo, periodo, linhas, "
            "como_foi_usado, respostas_consolidado, linhas_excluidas_consolidacao, observacao) VALUES ("
            f"{sql_str(row.get('Arquivo recebido'))}, {sql_str(row.get('Tipo'))}, "
            f"{sql_str(row.get('Conteúdo', row.get('Conteudo')))}, {sql_str(row.get('Período', row.get('Periodo')))}, "
            f"{sql_num(row.get('Linhas'))}, {sql_str(row.get('Como foi usado'))}, "
            f"{sql_int(row.get('Respostas que entraram no consolidado'))}, "
            f"{sql_int(row.get('Linhas excluídas na consolidação', row.get('Linhas excluidas na consolidacao')))}, "
            f"{sql_str(row.get('Observação', row.get('Observacao')))}) "
            "ON CONFLICT (arquivo_recebido, periodo, tipo) DO UPDATE SET conteudo = EXCLUDED.conteudo, "
            "linhas = EXCLUDED.linhas, como_foi_usado = EXCLUDED.como_foi_usado, "
            "respostas_consolidado = EXCLUDED.respostas_consolidado, "
            "linhas_excluidas_consolidacao = EXCLUDED.linhas_excluidas_consolidacao, observacao = EXCLUDED.observacao, "
            "imported_at = now();"
        )

    excl = pd.read_excel(xl, sheet_name=sheet_name(xl, "Exclu"))
    for _, row in excl.iterrows():
        lines.append(
            "INSERT INTO nps_historico.excluidos (motivo_exclusao, data_resposta, cliente, nota_nps, fonte_arquivo, "
            f"fonte_aba, id_resposta, ref_programa) VALUES ({sql_str(row.get('motivo_exclusao'))}, "
            f"{sql_ts(row.get('data_resposta'))}, {sql_str(row.get('cliente'))}, {sql_num(row.get('nota_nps'))}, "
            f"{sql_str(row.get('fonte_arquivo'))}, {sql_str(row.get('fonte_aba'))}, {sql_str(row.get('id_resposta'))}, "
            f"{sql_str(row.get('ref_programa'))});"
        )

    mot = pd.read_excel(xl, sheet_name=sheet_name(xl, "Motivos"))
    for _, row in mot.iterrows():
        lines.append(
            f"INSERT INTO nps_historico.motivos_exclusao (motivo, linhas) VALUES ({sql_str(row.get('Motivo'))}, "
            f"{sql_int(row.get('Linhas'))}) ON CONFLICT (motivo) DO UPDATE SET linhas = EXCLUDED.linhas, imported_at = now();"
        )

    lines.append("COMMIT;")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("\n".join(lines), encoding="utf-8")
    print(json.dumps({"sql_file": str(OUT), "statements": len(lines) - 2, "respostas": len(df)}, indent=2))


if __name__ == "__main__":
    main()
