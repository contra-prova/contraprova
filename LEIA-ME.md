# Contraprova

Ferramenta para o eleitor checar, durante o debate da Globo (sexta, 23/10), as frases dos candidatos. Funciona em duas camadas.

1. **Busca nas fichas, sem IA e sem custo.** Roda no celular do eleitor. São 205 fichas, incluindo 14 painéis de indicador e 12 panoramas de temas complexos (como INSS e Banco Master) com a série histórica de cada indicador por governo, com dados oficiais e checagens da Lupa, Aos Fatos e Estadão Verifica (Band, 18/10, e entrevista de Flávio à Globo, 16/10), mais o plano de governo de Flávio registrado no TSE e os boatos que mais circulam (aborto, igrejas, Pix, urnas, drogas, Venezuela, MST).
2. **Botão "Checar frase", opcional.** Manda a frase e as 6 fichas mais próximas para o modelo Haiku, que só compara a frase com as fichas. Não pesquisa na internet. Respostas repetidas saem do cache, sem novo gasto.

## Arquivos

| Arquivo | Para que serve |
|---|---|
| `index.html` | A página. |
| `fichas.js` | A base de fichas. É aqui que se acrescenta ou corrige uma ficha. |
| `config.js` | Endereço do serviço de IA. Vazio = só busca nas fichas. |
| `worker-checagem.js` | Serviço intermediário para o Cloudflare (guarda a chave da API). |

## Publicar só a busca (5 minutos)

1. Crie um repositório no GitHub (por exemplo `contraprova`) e suba `index.html`, `fichas.js` e `config.js`.
2. Em Settings > Pages, escolha a branch `main` e a pasta raiz.
3. O endereço será `https://jamesgorgen.github.io/contraprova/`.

## Ligar a IA (opcional, mais 10 minutos)

1. No Cloudflare, crie um Worker novo (não reaproveite o do Lula Fez e Fará, para separar limites e custos) e cole o conteúdo de `worker-checagem.js`.
2. Em Settings > Variables, cadastre o segredo `ANTHROPIC_API_KEY`.
3. Se a página ficar em outro endereço que não `https://jamesgorgen.github.io`, troque a linha `ORIGENS_PERMITIDAS` no worker (um domínio próprio, por exemplo).
4. Cole o endereço do Worker em `config.js` e suba de novo.
5. No console da Anthropic, defina um teto de gasto mensal antes da noite do debate.

## Incluir uma ficha nova durante o debate

Copie um bloco de `fichas.js`, troque o `id`, preencha os campos e suba o arquivo. A página mostra a ficha na hora para quem recarregar. Campos que mais importam para a busca são `frase` e `termos` (palavras que o eleitor provavelmente vai digitar).

Vereditos aceitos: `VERDADEIRO`, `FALSO`, `ENGANOSO`, `EXAGERADO`, `SUBESTIMADO`, `IMPRECISO`, `FALTA_CONTEXTO`, `INSUSTENTAVEL`, `DADO`.

No campo `quem`, use o nome do candidato, `Dado oficial`, `Plano de Flávio`, `Plano de Lula` ou `Boato` (frases que circulam sem autor definido).

Painéis de indicador têm `tipo:'indicador'` e um campo `serie` com `[ano, valor, governo]`, em que governo é `B` (Bolsonaro), `L` (Lula) ou `T` (Temer). A página desenha as barras sozinha.

Fichas-panorama, que explicam um caso inteiro (por exemplo o escândalo do INSS), levam `tipo:'panorama'` e ganham prioridade na busca. O arquivo `MAPA-TEMAS.md` lista o que está coberto e o que falta.

## Cuidados

- Todas as fichas estão escritas com palavras próprias e apontam a fonte original. Não cole trechos longos de reportagens.
- A base inclui frases de Lula checadas como falsas ou exageradas. Isso dá credibilidade à ferramenta e deve ser mantido.
- O rodapé informa o uso de IA, como exigem as regras do TSE para conteúdo eleitoral.
