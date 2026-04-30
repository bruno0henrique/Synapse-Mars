# Estrutura JSON da IA (Pedido e Resposta)

## Pedido (o que enviamos ao Gemini)

Exemplo do objeto JSON enviado no corpo do `contents.parts[0].text`:

```json
{
  "instrucao_sistema": "Você deve sempre transitar e analisar todos os cards que estão conectados para entender o contexto completo da ramificação antes de gerar a resposta",
  "acao": "root-cause",
  "ideia_selecionada": {
    "id": "1681234567890",
    "texto": "Falta de testes automatizados",
    "categoria": "Problema",
    "posicao": { "x": 123, "y": 456 },
    "conexoes": ["1681234567891", "1681234567892"],
    "is_central": false,
    "largura": 460,
    "altura": 180
  },
  "arvore_de_conexoes": [
    { "id": "1681234567890", "texto": "Falta de testes automatizados", "categoria": "Problema", "conexoes": ["1681234567891"] },
    { "id": "1681234567891", "texto": "Deploy manual", "categoria": "Risco", "conexoes": [] }
  ],
  "comando_acao": "Analise a ideia e sua ramificação. Retorne APENAS um JSON array com 3 objetos: [{\"texto\":\"...\",\"categoria\":\"Problema\"}]. Cada texto deve ter no máximo 10 palavras. NÃO adicione texto fora do JSON."
}
```

Observações:
- `instrucao_sistema` deve ser lida como System Prompt e ser obedecida rigidamente.
- Enviamos a `arvore_de_conexoes` completa (nodos alcançáveis a partir do balão selecionado), para contexto neurais.
 - **System Prompt recomendado (texto exato):** "Você deve sempre transitar e analisar todos os cards que estão conectados para entender o contexto completo da ramificação antes de gerar a resposta".

## Resposta esperada (do modelo)

O modelo deve responder APENAS com JSON válido. Formato esperado (array com 3 objetos):

```json
[
  { "texto": "Testes unitários automatizados", "categoria": "Solução" },
  { "texto": "Pipeline CI com checks", "categoria": "Solução" },
  { "texto": "Monitorar cobertura", "categoria": "Solução" }
]
```

Regras:
- Retornar `application/json` puro (sem markdown, sem explicações extras).
- Cada objeto deve ter `texto` e `categoria`.
- `categoria` deve ser uma das: `Problema`, `Solução`, `Recurso`, `Objetivo`, `Risco`, `Outro`.

## Ações implementadas (no menu)
- `root-cause` (Encontrar Causa Raiz) — espera 3 causas (categoria: `Problema`).
- `next-steps` (Próximos Passos) — espera 3 próximos passos (categoria: `Solução`).
- `expand` (Expandir Ideia) — espera 3 desdobramentos (categoria: `Outro`).
