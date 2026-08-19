/**
 * Rotina & Foco — Worker de IA
 * -----------------------------------------------------------------
 * Ponte entre o site (GitHub Pages) e a API da Anthropic.
 * A chave de API fica guardada como "secret" aqui dentro,
 * nunca é enviada nem exposta ao navegador.
 *
 * Ações suportadas (enviadas pelo site no campo "action"):
 *   - "analisar-edital"  → extrai matérias/tópicos de um edital em PDF
 *   - "gerar-material"   → gera resumo + flashcards de um PDF de estudo
 *
 * IMPORTANTE: troque ALLOWED_ORIGIN abaixo pela URL exata do seu site
 * publicado (ex.: "https://flavioborrges.github.io"), sem barra no final.
 */

const ALLOWED_ORIGIN = "https://flavioborrges.github.io";
const MODEL = "claude-sonnet-5";

export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: cors });
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return jsonError("JSON inválido no pedido.", 400, cors);
    }

    const { action, pdf_base64 } = body;
    if (!action || !pdf_base64) {
      return jsonError("Faltou 'action' ou 'pdf_base64' no pedido.", 400, cors);
    }

    const prompt = buildPrompt(action);
    if (!prompt) {
      return jsonError("Ação desconhecida: " + action, 400, cors);
    }

    if (!env.ANTHROPIC_API_KEY) {
      return jsonError("Chave de API não configurada no Worker (ANTHROPIC_API_KEY).", 500, cors);
    }

    let anthropicRes;
    try {
      anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 4096,
          messages: [
            {
              role: "user",
              content: [
                { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdf_base64 } },
                { type: "text", text: prompt },
              ],
            },
          ],
        }),
      });
    } catch (e) {
      return jsonError("Falha ao chamar a API da Anthropic: " + e.message, 502, cors);
    }

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      return jsonError("Erro retornado pela Anthropic (" + anthropicRes.status + "): " + errText, 502, cors);
    }

    const data = await anthropicRes.json();
    const textBlock = (data.content || []).find((b) => b.type === "text");
    const rawText = textBlock ? textBlock.text : "";

    let parsed;
    try {
      const cleaned = rawText.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
      parsed = JSON.parse(cleaned);
    } catch (e) {
      return jsonError("A IA não devolveu um JSON válido. Tente novamente.", 502, cors, rawText);
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  },
};

function buildPrompt(action) {
  if (action === "analisar-edital") {
    return `Você é um mentor de concursos públicos experiente, do tipo que explica editais em vídeos e cursos online. Analise este edital de concurso público em PDF, focando no cargo indicado no PDF (ou no cargo mais evidente, se houver vários). Organize as informações do jeito que um mentor explicaria pra um aluno: claro, direto, sem juridiquês desnecessário.

Responda APENAS com um JSON válido, sem crases, sem markdown, sem texto antes ou depois, neste formato exato:
{"nome": "Órgão — Cargo", "orgao": "Nome do órgão", "cargo": "Nome do cargo", "vagas": "Texto descrevendo as vagas (ex: '15 vagas + cadastro de reserva')", "dataProva": "Data da prova em DD/MM/AAAA, ou uma descrição textual se ainda não estiver definida", "resumoGeral": "2 a 4 frases explicando o concurso de forma simples: banca organizadora, nível de dificuldade esperado, perfil geral da prova", "materias": [{"nome": "Nome da matéria", "pontosImportantes": "1 a 2 frases com uma dica prática de como estudar essa matéria para esse cargo específico", "topicos": ["Tópico 1 exatamente como consta no edital", "Tópico 2"]}]}

Os tópicos de cada matéria devem ser extraídos EXATAMENTE como aparecem no edital, sem resumir, sem pular nenhum. Já "resumoGeral" e "pontosImportantes" são sua própria elaboração como mentor, em linguagem simples e direta.`;
  }
  if (action === "gerar-material") {
    return `Você está analisando um material de estudo em PDF. Produza um resumo conciso do conteúdo (3 a 6 parágrafos, em português, cobrindo os pontos mais importantes) e um conjunto de 12 a 20 flashcards (pergunta objetiva na frente, resposta direta no verso) cobrindo os principais conceitos e fatos do material.

Responda APENAS com um JSON válido, sem crases, sem markdown, sem texto antes ou depois, neste formato exato:
{"titulo": "Título do material (extraia ou infira do conteúdo)", "resumo": "texto do resumo aqui", "flashcards": [{"frente": "pergunta", "verso": "resposta"}]}`;
  }
  return null;
}

function jsonError(message, status, cors, raw) {
  const payload = { error: message };
  if (raw) payload.raw = raw;
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
