import { CultureArticle } from '../types/index.ts';
import { markdownToHtml } from '../utils/richText.ts';

const RAW_ARTICLES = [
  {
    id: 'art_sociedades_tiro_sc',
    slug: 'sociedades-culturais-tiro-ao-alvo-norte-sc',
    title: 'Sociedades Culturais de Tiro ao Alvo no Norte de Santa Catarina',
    subtitle: 'O coração comunitário, a camaradagem (Gemütlichkeit) e o pioneirismo germânico no Vale do Itapocu',
    category: 'tiro_ao_alvo' as const,
    categoryLabel: 'Sociedades de Tiro',
    order: 1,
    highlighted: true,
    published: true,
    imageUrl: 'https://images.unsplash.com/photo-1544717305-2782549b5136?w=800&auto=format&fit=crop&q=80',
    summary: 'As Sociedades de Tiro ao Alvo (Schützenvereine) representam uma das mais ricas e duradouras manifestações comunitárias de Santa Catarina, transformando o esporte de precisão em elo familiar e cultural.',
    rawContent: `As **Sociedades Culturais e Esportivas de Tiro ao Alvo** (*Schützenvereine*) constituem uma das mais profundas e admiráveis manifestações da identidade comunitária do Norte de Santa Catarina, em especial no **Vale do Itapocu** (que abriga municípios como Schroeder, Jaraguá do Sul, Guaramirim e Corupá) e no Vale do Itajaí.

### Origens e Chegada ao Brasil
Com a chegada dos imigrantes de língua germânica na segunda metade do século XIX (a partir de 1850-1870), os colonizadores enfrentaram a densa Mata Atlântica e o isolamento dos vales fluviais. Diante da ausência de estruturas estatais de lazer e proteção social, os pioneiros recriaram nas novas terras as agremiações que conheciam em sua terra natal na Europa Central.

O tiro ao alvo, longe de ter finalidade bélica, era praticado desde a Idade Média nas cidades hanseáticas e germânicas como um **esporte de precisão, disciplina cívica e cavalheirismo**. Em Santa Catarina, tornou-se o principal motor de união entre as famílias vizinhas.

### A Filosofia da Gemütlichkeit
Em torno do estande de tiro rústico construído com toras de madeira de lei, surgiam o salão de baile, a cancha de bocha e as mesas para o jogo de cartas (*Skat* e canastra). Nasceu assim o ambiente de *Gemütlichkeit* — termo alemão intraduzível que expressa aconchego, cordialidade, sensação de bem-estar compartilhado e amizade sincera.

Nas sociedades de tiro, todas as gerações se encontram: o bisavô ensina a postura correta de empunhadura ao neto, a avó prepara as cucas e o marreco recheado, as crianças correm pelos pátios e a comunidade preserva o dialeto, a música de bandinha e os valores de integridade moral.

### Reconhecimento e Patrimônio Vivo
Hoje, a região do Vale do Itapocu abriga uma das maiores concentrações de sociedades de atiradores do planeta fora da Alemanha. Tombadas pelo afeto popular e reconhecidas como **patrimônio imaterial de Santa Catarina**, essas instituições continuam a formar campeões esportivos e, acima de tudo, cidadãos comprometidos com suas raízes.`,
  },
  {
    id: 'art_festas_de_rei',
    slug: 'as-festas-de-rei-e-rainha-konigsschiessen',
    title: 'As Festas de Rei e Rainha: O Königsschießen e o Cortejo de Honra',
    subtitle: 'A mais tradicional celebração das sociedades: o ritual de busca do monarca, desfiles em trajes típicos e o baile de gala',
    category: 'festas_de_rei' as const,
    categoryLabel: 'Tradição & Rituais',
    order: 2,
    highlighted: true,
    published: true,
    imageUrl: 'https://images.unsplash.com/photo-1519741497674-611481863552?w=800&auto=format&fit=crop&q=80',
    summary: 'A cada ano, a disputa pelo título de Schützenkönig (Rei do Tiro) culmina no solene ritual da Busca do Rei, cortejo com banda típica e o grandioso baile de coroação.',
    rawContent: `Entre todas as datas do calendário de uma sociedade de atiradores, nenhuma se compara em pompa, emoção e reverência à **Festa de Rei e Rainha** (*Königsschießen* e *Königsfest*).

### O Tiro Real e a Proclamação
Durante semanas ou em uma bateria cerimonial fechada, os sócios atiradores disputam os disparos de honra. O atirador que alcançar o centro mais perfeito (*Teiler*) é consagrado como o **Rei do Tiro** (*Schützenkönig*). Concomitantemente, as atiradoras disputam o título de **Rainha** (*Schützenkönigin*), além de serem coroados o 1º e 2º Cavalheiros e Princesas, bem como as categorias de Rei Juvenil e Mirim.

O segredo sobre quem acertou o melhor tiro muitas vezes é guardado em envelope lacrado até o momento solene do anúncio oficial da diretoria, gerando intensa expectativa em toda a sociedade.

### A Busca do Rei (König Abholen)
O ponto alto do fim de semana festivo é o desfile de **Busca do Rei**. A diretoria da sociedade, acompanhada por todos os associados em trajes típicos germânicos (*Trachten*), porta-bandeiras oficiais e uma animada banda típica de sopro (*Blaskapelle*), desloca-se em cortejo até a residência do Rei do ano anterior ou do novo monarca.

Chegando à casa do Rei:
1. **Apresentação de Armas e Saudação**: O comandante do desfile solicita permissão para ingressar à propriedade.
2. **A Marcha e Homenagem**: A banda entoa os hinos tradicionais e as marchas festivas germânicas.
3. **Recepção e Confraternização**: O Rei e sua família abrem as portas de seu lar e oferecem um farto banquete aos presentes com chopp, canapés alemães, cucas e salgadinhos artesanais.
4. **Entrega da Faixa Real**: O Rei passa a ostentar a faixa de veludo bordada a ouro e o pesado colar cerimonial de medalhões de prata (*Königskette*), no qual cada monarca da história da sociedade gravou seu nome em uma plaqueta.

### O Baile de Gala e a Valsa de Honra
Após o cortejo retornar triunfalmente à sede social, tem início o jantar oficial. Em seguida, as luzes se voltam para o centro do salão: sob aplausos calorosos, o Rei e a Rainha abrem a pista executando a tradicional **Valsa dos Reis**, convidando em seguida toda a diretoria e os sócios para dançar noite adentro.`,
  },
  {
    id: 'art_modalidades_tiro',
    slug: 'modalidades-chumbinho-passaro-dado',
    title: 'Modalidades Tradicionais de Tiro: Chumbinho, Pássaro e Dado',
    subtitle: 'Da precisão olímpica da carabina de ar à emoção comunitária do tiro ao pássaro de madeira e a perícia do dado',
    category: 'modalidades' as const,
    categoryLabel: 'Modalidades Esportivas',
    order: 3,
    highlighted: true,
    published: true,
    imageUrl: 'https://images.unsplash.com/photo-1595590424283-b8f17842773f?w=800&auto=format&fit=crop&q=80',
    summary: 'Conheça em detalhes as três modalidades mais célebres praticadas nas sociedades de Santa Catarina: a carabina de ar (chumbinho), o tiro ao pássaro e o tiro ao dado.',
    rawContent: `O universo do tiro tradicional catarinense equilibra o esporte de alto rendimento com jogos tradicionais de pura habilidade coletiva. Três modalidades se destacam como os grandes pilares das sociedades do Norte de SC:

---

### 1. Carabina de Ar / Chumbinho (Luftgewehr 10m)
A modalidade de **Carabina de Ar Comprimido (calibre 4.5mm)** é a disciplina rainha do tiro esportivo de precisão.
- **Distância Oficial**: 10 metros da linha de tiro até o alvo.
- **O Alvo**: Círculos concêntricos pretos onde a pontuação máxima (o 10) possui a dimensão de uma cabeça de alfinete (apenas 0,5 milímetro de diâmetro no centro).
- **Exigência**: Pede postura corporal estática, controle do batimento cardíaco, concentração mental absoluta e técnica de respiração apurada. É a modalidade disputada nas Olimpíadas e nas etapas do campeonato regional da ACSTVI (Associação dos Clubes e Sociedades de Tiro do Vale do Itapocu).

---

### 2. Tiro ao Pássaro de Madeira (Vogelschießen)
O **Tiro ao Pássaro** é uma das mais ancestrais e emocionantes tradições da cultura germânica, remontando ao século XV na Europa.
- **A Estrutura**: Um pássaro estilizado, esculpido artesanalmente em madeira de lei (geralmente cedro ou pinho selecionado), é fixado no topo de um mastro vertical elevado.
- **A Disputa**: Os competidores atiram em ordem sucessiva. Cada parte do pássaro tem um valor simbólico e pontuação: primeiro derruba-se a asa esquerda, em seguida a asa direita, a cauda, a cabeça e a coroa.
- **O Grande Clímax**: Quando resta apenas o tronco central do pássaro, a tensão atinge o ápice. O atirador que disparar o tiro derradeiro que faz cair o último fragmento de madeira é solenemente aclamado como o **Rei do Pássaro** (*Vogelkönig*), recebendo honras perpétuas na sociedade.

---

### 3. Tiro ao Dado (Würfelschießen)
O **Tiro ao Dado** é uma modalidade folclórica cativante e de extrema destreza.
- **Como Funciona**: Pequenos cubos de madeira ou blocos de chumbo (dados) são milimetricamente enfileirados ou empilhados sobre suportes metálicos a curta distância.
- **Objetivo**: O atirador precisa demonstrar controle absoluto para derrubar dado por dado sem desequilibrar a estrutura adjacente, ou derrubar o maior número de peças em disparos sequenciais cronometrados.
- **Clima Festivo**: Pela proximidade do público e a velocidade dos resultados, o tiro ao dado atrai grande torcida nos almoços de domingo e festas de aniversário das sociedades.`,
  },
  {
    id: 'art_schutzenfest_schutzenbaum',
    slug: 'a-schutzenfest-e-o-simbolo-do-schutzenbaum',
    title: 'A Schützenfest e o Símbolo Sagrado do Schützenbaum',
    subtitle: 'A maior celebração de atiradores das Américas e a árvore com os brasões que sela a fraternidade eterna das sociedades teutas',
    category: 'schutzenfest' as const,
    categoryLabel: 'Festivais & Símbolos',
    order: 4,
    highlighted: true,
    published: true,
    imageUrl: 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=800&auto=format&fit=crop&q=80',
    summary: 'Nascida em 1989, a Schützenfest projeta Santa Catarina para o mundo. Ao seu lado, o Schützenbaum ergue os brasões das sociedades como testemunha de união inquebrantável.',
    rawContent: `A expressão máxima da pujança e da alegria das sociedades de atiradores de Santa Catarina se materializa na **Schützenfest** e no seu símbolo maior de união: o **Schützenbaum**.

### A Schützenfest: A Maior Festa de Atiradores do Brasil
Criada em **1989** no município de Jaraguá do Sul e abraçada com entusiasmo por todas as cidades vizinhas como Schroeder, Pomerode e Guaramirim, a Schützenfest surgiu com o propósito nobre de:
- Unir em um grande festival anual todas as sociedades de tiro da região;
- Resgatar e difundir a dança folclórica, a música das bandinhas e o canto coral teuto;
- Promover a culinária germânica autêntica e o chopp artesanal de Santa Catarina;
- Democratizar o tiro esportivo: durante os dias da festa, estandes de tiro com tecnologia de ponta ficam abertos para que dezenas de milhares de turistas e visitantes possam experimentar a prática do tiro com carabina de ar comprimido, acompanhados por instrutores credenciados.

Hoje, a Schützenfest reúne mais de 150 mil visitantes por edição e registra anualmente mais de **100 mil tiros esportivos disparados**, consolidando-se como a maior celebração do gênero em todas as Américas.

### O Schützenbaum: A Árvore dos Atiradores
Inspirado na secular tradição do *Maibaum* (Árvore de Maio) da Baviera e Áustria, o **Schützenbaum** foi adaptado para homenagear as sociedades de tiro:
- **Estrutura**: Um imponente tronco de madeira ou mastro de aço, pintado nas tradicionais cores azul e branca ou vermelho e verde, ergue-se imponente em praça pública ou na entrada dos complexos sociais.
- **Os Brasões**: Ao longo de seus galhos e braços laterais de ferro forjado, são fixadas placas de metal e escudos heráldicos de cada uma das sociedades e clubes de atiradores federados na região — incluindo com orgulho a **Associação Rio Camarada**.
- **Significado**: O Schützenbaum simboliza a **força da coletividade**, a lealdade entre as comunidades e a promessa solene de que as tradições herdadas dos antepassados não serão esquecidas pelas novas gerações. Ergue-se como um tributo aos fundadores que, com as mãos calejadas pela terra, semearam a cultura e a paz.`,
  },
  {
    id: 'art_rio_camarada_historia',
    slug: 'sociedade-tiro-rio-camarada-schroeder',
    title: 'Sociedade de Tiro ao Alvo Rio Camarada: Ontem e Hoje em Schroeder (SC)',
    subtitle: 'A saga dos imigrantes pioneiros no bairro Rio Camarada, a construção do estande histórico e a evolução para a Associação Rio Camarada',
    category: 'sociedade_rio_camarada' as const,
    categoryLabel: 'Nossa Associação',
    order: 5,
    highlighted: true,
    published: true,
    imageUrl: 'https://images.unsplash.com/photo-1513836279014-a89f7a76ae86?w=800&auto=format&fit=crop&q=80',
    summary: 'Localizada no charmoso município de Schroeder, a agremiação nasceu do companheirismo dos moradores às margens do Rio Camarada e hoje desponta como símbolo de cidadania e preservação histórica.',
    rawContent: `No coração do acolhedor município de **Schroeder (SC)** — terra de natureza exuberante, encravada aos pés da Serra do Mar e banhada por rios de águas cristalinas — repousa uma história de coragem, trabalho e união: a trajetória da **Sociedade de Tiro ao Alvo Rio Camarada**, hoje solenemente denominada **Associação Rio Camarada**.

### Os Primeiros Passos no Bairro Rio Camarada
Nas primeiras décadas do século XX, os colonos que se estabeleceram ao longo das margens sinuosas do Rio Camarada dedicavam a semana inteira ao trabalho braçal nos bananais, nos arrozais e na lavoura de subsistência. A vida era dura e marcada pela distância dos grandes centros urbanos.

Aos domingos pela manhã, porém, os vizinhos se reuniam com suas famílias. Foi desse sentimento de camaradagem espontânea — que deu nome ao próprio rio e ao bairro — que nasceu a ideia de formalizar a **Sociedade de Tiro ao Alvo Rio Camarada**.

Com esforço coletivo (*Mutirão* ou *Gemeinschaftsarbeit*):
- Os próprios moradores doaram a madeira e construíram a primeira sede social;
- Aplainaram o terreno e ergueram os para-balas de terra e dormentes para a linha de tiro segura;
- Adquiriram as primeiras carabinas de mola e chumbinho, permitindo que jovens e adultos treinassem com precisão e disciplina.

### O Papel Social e Comunitário
A Sociedade Rio Camarada rapidamente se tornou o centro nevrálgico de Schroeder:
- **Festas de Rei e Rainha**: Conhecidas em todo o Vale do Itapocu pelo capricho dos almoços coloniais, pelos desfiles cheios de elegância e pela acolhida calorosa aos visitantes de outros municípios;
- **Equipes de Tiro de Alto Rendimento**: Atiradores e atiradoras da sociedade figuram com destaque nos pódios dos campeonatos regionais da ACSTVI e nos Jogos Abertos de Santa Catarina;
- **Eventos Comunitários**: Casamentos de famílias pioneiras, batizados, aniversários e encontros beneficentes que moldaram o tecido social de Schroeder.

### A Modernização: Associação Rio Camarada
Acompanhando as exigências jurídicas contemporâneas e a expansão de suas atividades culturais e esportivas, a agremiação atualizou seus estatutos sociais, passando a atuar sob o nome institucional de **Associação Esportiva e Cultural Rio Camarada (Associação Rio Camarada)**.

Com governança transparente, proteção aos dados dos associados conforme a **LGPD**, emissão de credenciais digitais inteligentes e forte presença nas comemorações cívicas de Schroeder e na Schützenfest, a Associação Rio Camarada olha para o futuro com a mesma chama viva acesa pelos seus bravos pioneiros: **Honra, Tradição e Amizade**.`,
  },
];

export const DEFAULT_CULTURE_ARTICLES: CultureArticle[] = RAW_ARTICLES.map(art => ({
  id: art.id,
  slug: art.slug,
  title: art.title,
  subtitle: art.subtitle,
  category: art.category,
  categoryLabel: art.categoryLabel,
  order: art.order,
  highlighted: art.highlighted,
  published: art.published,
  imageUrl: art.imageUrl,
  summary: art.summary,
  content: markdownToHtml(art.rawContent),
  updatedAt: new Date().toISOString(),
  updatedBy: 'Diretoria Cultural',
}));
