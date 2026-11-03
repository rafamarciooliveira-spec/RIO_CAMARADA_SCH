# Estúdio da landing do Sodalis

## Regras (proíbem o genérico)
- Nada de título centralizado sobre degradê; nada de "tudo entra com fade".
- Cada elemento entra com propósito: palavra que se forma (máscara por palavra), número que conta, linha que desenha (SVG `pathLength`), cartão que vem da profundidade (translateZ/rotate), faixa que revela.
- Ease forte: `[0.16, 1, 0.3, 1]` (expo out). Nunca linear. Entradas de 0,4 a 0,9 s, stagger de 40 a 80 ms.
- Uma ideia por cena, um destaque por quadro. Frase curta fica ao menos 1,5 s legível na rolagem.
- Interface mostrada é a do produto: a carteirinha do hero é o mesmo componente visual da carteirinha real (padrões guilloché, ondas e malha do `DigitalCard`). Os painéis das cenas usam o kit `src/ui` e dados marcados como fictícios. Quando as telas finais existirem, a demonstração "Ver sistema" mostra o sistema de verdade.
- `prefers-reduced-motion`: tudo aparece parado e legível, sem tilt e sem troca automática.
- Português do Brasil; sem travessão como pausa; tom de cuidado com quem doa tempo à sociedade.
- Sem depoimentos, clientes, certificações ou números inventados. Nomes de sociedades de exemplo levam "(exemplo)".

## Marca
- Conceito: **estandarte e certificado**. A tradição das sociedades (estandartes, diplomas com guilloché, medalhas) encontra a precisão do digital.
- Tokens: tinta `#0e100f`, verde-estandarte `#16261d`, latão `#c9a45a`, papel `#f3ecdd`, vinho `#5b1f2a`, linha `#2a302c`.
- Fontes: Fraunces (títulos, serifa com personalidade) e Inter (texto). Google Fonts com `display=swap`.
- Logo do Sodalis: monograma "S" dentro de um selo circular de linhas finas (SVG em código).

## Estados (grade de 0,5 s)
1. Hero (0 a 2 s): a frase "Tradição que se organiza." forma palavra por palavra (0,08 s de stagger); a carteirinha sobe da profundidade (0,9 s) e inclina com o ponteiro. A cada 2,6 s troca de sociedade de exemplo: a faixa de cor varre o cartão, logo e nome trocam por baixo dela.
2. Dor (rolagem 0 a 16%): pilha de papéis (planilha, caderno, recibo) cai em desordem; contadores do problema são qualitativos, não números.
3. Carteirinha (16 a 33%): QR desenha os módulos; selo "Válida" carimba; contagem de 60 s do QR rotativo.
4. Financeiro (33 a 50%): linha do fluxo de caixa desenha; barras de receitas e despesas sobem; saldo conta.
5. Eventos (50 a 66%): ingressos deslizam e são carimbados no check-in.
6. Atas (66 a 83%): linhas de texto escrevem; assinaturas se desenham; hash aparece.
7. Segurança (83 a 100%): cadeado fecha; camadas (regras, servidor, criptografia do CPF, auditoria) empilham.
8. Seções estáticas com entradas por máscara: para quem é, recursos, demonstração, segurança e LGPD, planos, perguntas, chamada final.

## Crítica
Antes de mostrar: capturas em 1440 e 390 px a cada estado da rolagem; nota de 0 a 10 em legibilidade, ritmo, marca, verdade da interface, nada genérico. Corrigir o pior até tudo ≥ 8.
