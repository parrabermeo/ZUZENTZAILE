import type { Language, Rubric, RubricCriterion, SkillMode, TextTypologyId } from '../types';

export interface TextTypologyMeta {
  id: TextTypologyId;
  title: Record<Language, string>;
  subtitle: Record<Language, string>;
  examples: Record<Language, string>;
  accentClasses: string;
  iconName:
    | 'book-open'
    | 'image'
    | 'file-spreadsheet'
    | 'scale'
    | 'list-ordered'
    | 'mail'
    | 'newspaper';
}

export const TEXT_TYPOLOGIES: TextTypologyMeta[] = [
  {
    id: 'narrative',
    title: { eu: 'Narrazioa', es: 'Texto Narrativo' },
    subtitle: { eu: 'Ipuina, kontakizuna, biografia', es: 'Cuento, relato, biografía' },
    examples: {
      eu: 'Abentura-ipuina, bizipen-kontakizuna edo biografia laburra',
      es: 'Cuento de aventuras, relato personal o biografía breve',
    },
    accentClasses: 'from-teal-500 to-emerald-600',
    iconName: 'book-open',
  },
  {
    id: 'descriptive',
    title: { eu: 'Deskribapena', es: 'Texto Descriptivo' },
    subtitle: { eu: 'Pertsonak, paisaiak, objektuak', es: 'Personas, paisajes, objetos' },
    examples: {
      eu: 'Pertsonaia baten erretratua, Euskal Herriko paisaia edo objektu berezia',
      es: 'Retrato de un personaje, paisaje de Euskadi o descripción de un objeto',
    },
    accentClasses: 'from-sky-500 to-blue-600',
    iconName: 'image',
  },
  {
    id: 'expository',
    title: { eu: 'Azalpen-testua', es: 'Texto Expositivo' },
    subtitle: { eu: 'Dibulgaziozkoa, eskema/laburpena', es: 'Divulgativo, esquema/resumen' },
    examples: {
      eu: 'Zientzia-dibulgazioko fitxa, animalia edo fenomeno baten azalpena',
      es: 'Artículo divulgativo, informe escolar o resumen estructurado',
    },
    accentClasses: 'from-indigo-500 to-violet-600',
    iconName: 'file-spreadsheet',
  },
  {
    id: 'argumentative',
    title: { eu: 'Iritzi-artikulua / Argudioa', es: 'Texto Argumentativo / Opinión' },
    subtitle: { eu: 'Iritzi-testua, argudioak', es: 'Artículo de opinión, argumentos' },
    examples: {
      eu: 'Mugikorren erabilera, ingurumena edo eskolako hobekuntza-proposamena',
      es: 'Uso de pantallas, cuidado ambiental o propuesta de mejora escolar',
    },
    accentClasses: 'from-amber-500 to-orange-600',
    iconName: 'scale',
  },
  {
    id: 'instructive',
    title: { eu: 'Jarraibide-testua', es: 'Texto Instructivo' },
    subtitle: { eu: 'Errezetak, joko-arauak, eskuliburuak', es: 'Recetas, normas de juego, manuales' },
    examples: {
      eu: 'Sukaldaritza-errezeta, mahai-joko baten arauak edo eskulanen pausoak',
      es: 'Receta de cocina, reglamento de un juego o manual paso a paso',
    },
    accentClasses: 'from-emerald-500 to-green-600',
    iconName: 'list-ordered',
  },
  {
    id: 'epistolary',
    title: { eu: 'Gutuna / Mezu elektronikoa', es: 'Texto Epistolar / Correo' },
    subtitle: { eu: 'Formala eta informala', es: 'Formal e informal' },
    examples: {
      eu: 'Udalari zuzendutako eskaera formala edo lagun bati idatzitako mezua',
      es: 'Correo formal al ayuntamiento/dirección o carta informal a un amigo',
    },
    accentClasses: 'from-rose-500 to-pink-600',
    iconName: 'mail',
  },
  {
    id: 'journalistic',
    title: { eu: 'Albistea (Kazetaritza)', es: 'Texto Periodístico / Noticia' },
    subtitle: { eu: 'Titularra, sarrera (6W), gorputza', es: 'Titular, entradilla (6W), cuerpo' },
    examples: {
      eu: 'Ikastetxeko gertakaria, kultur ekitaldia edo ingurumen-albistea',
      es: 'Noticia sobre el medio ambiente, evento escolar o crónica local',
    },
    accentClasses: 'from-cyan-600 to-teal-700',
    iconName: 'newspaper',
  },
];

function getGrammarCriterion(lang: Language): RubricCriterion {
  if (lang === 'eu') {
    return {
      id: 'crit-grammar-eu',
      code: 'CE5.3',
      name: 'Zuzentasun ortografikoa eta gramatikala (Euskara)',
      weight: 2.0,
      levels: {
        1: 'Akats ugari ditu oinarrizko arauetan (ergatiboa -k, NOR/NOR-NORK komunztadura, h letra, puntuazioa), ulermena zailduz.',
        2: 'Oinarrizko arau batzuk betetzen ditu, baina hutsegite nabarmenak egiten ditu deklinabidean, aditz-komunztaduran edo tx/ts/tz eta s/z/x bereizketan.',
        3: 'Oro har zuzen erabiltzen ditu ergatiboa, aditz-laguntzaileak, h letra eta puntuazio-markak, akats txiki isolatuekin.',
        4: 'Ortografia eta gramatika bikainak ditu LH6ko mailarako: deklinabide zehatza, komunztadura egokia eta puntuazio aberatsa.',
      },
    };
  }

  return {
    id: 'crit-grammar-es',
    code: 'CE5.3',
    name: 'Corrección ortográfica y gramatical (Castellano)',
    weight: 2.0,
    levels: {
      1: 'Presenta numerosos errores en ortografía básica (b/v, h, mayúsculas, tildes) y concordancias que dificultan la lectura.',
      2: 'Aplica algunas reglas básicas, pero mantiene errores frecuentes en acentuación (agudas, llanas, esdrújulas), puntuación o tiempos verbales.',
      3: 'Respeta mayoritariamente las normas ortográficas, tildes, signos de puntuación y concordancias de género, número y persona con fallos leves.',
      4: 'Domina la ortografía, acentuación y puntuación propias de 6º de Primaria, con concordancias precisas y presentación cuidada.',
    },
  };
}

interface TypologySpecificDescriptors {
  adequacy: Record<Language, RubricCriterion['levels']>;
  coherence: Record<Language, RubricCriterion['levels']>;
  cohesion: Record<Language, RubricCriterion['levels']>;
  lexicon: Record<Language, RubricCriterion['levels']>;
}

const TYPOLOGY_DESCRIPTORS: Record<TextTypologyId, TypologySpecificDescriptors> = {
  narrative: {
    adequacy: {
      eu: {
        1: 'Ez da narrazio-helburura egokitzen; istorioa oso laburra edo osatu gabea da eta ez du entzulegoa kontuan hartzen.',
        2: 'Gertaera bat kontatzen du, baina helburua edo ikuspuntua (1. edo 3. pertsona) ez dago erabat finkatuta.',
        3: 'Narrazio-helburura eta hartzailera ondo egokitzen da, narratzailearen ahotsari koherentziaz eutsiz.',
        4: 'Narrazio erakargarria eta helburu komunikatiboari guztiz egokitua sortzen du, irakurlearen interesa hasieratik amaierara mantenduz.',
      },
      es: {
        1: 'No se ajusta al propósito narrativo; el relato queda incompleto o desconectado de la consigna.',
        2: 'Cuenta un suceso acorde al tema, pero pierde por momentos el propósito comunicativo o cambia de narrador sin intención.',
        3: 'Se adecua bien al propósito narrativo y al lector, manteniendo un punto de vista narrativo coherente.',
        4: 'Logra un relato atractivo y plenamente adecuado al propósito, captando y manteniendo el interés del lector de principio a fin.',
      },
    },
    coherence: {
      eu: {
        1: 'Ez dira hasiera, korapiloa eta amaiera bereizten; gertaerek ordena logikorik edo denbora-harremanik ez dute.',
        2: 'Narrazioaren atal batzuk ageri dira, baina korapiloa ahula da edo amaiera bat-batekoa eta garatu gabea.',
        3: 'Egitura argia du (hasiera, korapiloa eta amaiera), pertsonaiak, lekua eta denbora koherentziaz antolatuta.',
        4: 'Egitura narratibo biribila du, deskribapen eta elkarrizketa txertatuekin, erritmo neurtuarekin eta amaiera sinesgarri edo harrigarriarekin.',
      },
      es: {
        1: 'No distingue inicio, nudo y desenlace; los hechos aparecen desordenados o con saltos ilógicos.',
        2: 'Incluye partes del relato, pero el conflicto está poco desarrollado o el desenlace resulta brusco.',
        3: 'Organiza claramente planteamiento, nudo y desenlace, situando personajes, espacio y tiempo con coherencia.',
        4: 'Construye una trama sólida y bien dosificada en párrafos, integrando descripciones o diálogos con un desenlace efectivo.',
      },
    },
    cohesion: {
      eu: {
        1: 'Esaldi solteak loturarik gabe edo lokailu bera behin eta berriz errepikatuz ("eta... eta...").',
        2: 'Denbora-lokailu oinarrizko gutxi batzuk erabiltzen ditu (gero, ondoren), baina errepikapen ugari dago.',
        3: 'Denbora- eta kausa-lokailu egokiak erabiltzen ditu (halako batean, horregatik, bitartean, azkenean) eta paragrafoak bereizten ditu.',
        4: 'Testu oso kohesionatua da; lokailu narratibo aberatsak, erreferente pronominalak eta paragrafo-trantsizio naturalak darabiltza.',
      },
      es: {
        1: 'Encadena oraciones sueltas o abusa de la repetición ("y luego... y entonces...") sin articulación.',
        2: 'Emplea algunos conectores temporales básicos, aunque persisten repeticiones innecesarias de nombres y nexos.',
        3: 'Usa conectores temporales y causales variados (de repente, mientras tanto, por eso, finalmente) evitando repeticiones.',
        4: 'Articula el relato con gran fluidez mediante conectores variados, elipsis y sustituciones pronominales precisas.',
      },
    },
    lexicon: {
      eu: {
        1: 'Oso hiztegi urria eta errepikakorra; oinarrizko aditz eta izen orokorrak soilik.',
        2: 'Hiztegi ulergarria baina xumea; adierazkortasun eta ñabardura gutxi pertsonaiak edo ekintzak adierazteko.',
        3: 'LH6ko mailarako hiztegi egokia eta askotarikoa, ekintza-aditz zehatzak eta adjektibo adierazgarriak erabiliz.',
        4: 'Hiztegi aberatsa, zehatza eta irudimentsua (sinonimoak, esapideak, konparazioak), narrazioari bizitasuna emanez.',
      },
      es: {
        1: 'Vocabulario muy limitado y repetitivo, con palabras comodín que empobrecen el relato.',
        2: 'Léxico comprensible pero sencillo, con escasa variedad de verbos de acción o adjetivos expresivos.',
        3: 'Utiliza vocabulario variado y preciso propio de 6º EP, seleccionando verbos y adjetivos adecuados a la escena.',
        4: 'Despliega un léxico rico y expresivo (sinónimos, comparaciones, metáforas sencillas) que da viveza a la narración.',
      },
    },
  },
  descriptive: {
    adequacy: {
      eu: {
        1: 'Ez du objektua, pertsona edo paisaia deskribatzen; zerrenda soltea edo gaiarekin loturarik gabeko testua da.',
        2: 'Deskribapen-asmoa antzematen da, baina ezaugarri gutxi eta gainazalekoak ematen ditu.',
        3: 'Helburu deskribatzailera ondo egokitzen da, irakurleak deskribatutakoa irudikatu ahal izateko datu egokiekin.',
        4: 'Deskribapen bizia eta helburura guztiz egokitua osatzen du, ikuspegi pertsonal edo objektibo argiarekin.',
      },
      es: {
        1: 'No cumple la intención descriptiva; se limita a enumerar rasgos aislados sin crear una imagen.',
        2: 'Responde parcialmente a la consigna descriptiva, pero aporta pocos detalles relevantes.',
        3: 'Se adecua correctamente al propósito descriptivo, permitiendo al lector visualizar lo descrito.',
        4: 'Logra una descripción vívida y fiel al propósito (objetivo o literario), generando una imagen clara en el lector.',
      },
    },
    coherence: {
      eu: {
        1: 'Ezaugarriak ordenarik gabe pilatuta ageri dira, irizpide espazialik edo tematikorik gabe.',
        2: 'Ordena saiatzen da, baina alderdi fisikoak, izaera edo espazio-atalak nahasten ditu paragrafo berean.',
        3: 'Deskribapena irizpide argi bati jarraituz antolatzen du (orokorretik zehatzera, goitik behera edo fisikoa/izaera bereiziz).',
        4: 'Egitura logiko eta orekatua du: sarrera orokorra, xehetasunen antolaketa ordenatua eta itxiera-inpresio orokorra.',
      },
      es: {
        1: 'Acumula rasgos sin criterio de orden, saltando de un aspecto a otro de forma caótica.',
        2: 'Presenta cierto orden, pero mezcla aspectos físicos, de carácter o espaciales dentro del mismo bloque.',
        3: 'Organiza la descripción con un orden lógico claro (de lo general al detalle, espacial o por planos/rasgos).',
        4: 'Estructura ejemplar en párrafos diferenciados: presentación global, desarrollo ordenado por planos y cierre valorativo.',
      },
    },
    cohesion: {
      eu: {
        1: 'Ez du espazio-antolatzailerik erabiltzen eta behin eta berriz errepikatzen du egitura bera ("dauka... dauka...").',
        2: 'Oinarrizko lokailu batzuk darabiltza, baina deskribapen-egiturak errepikakorrak dira.',
        3: 'Espazio- eta gehikuntza-lokailu egokiak erabiltzen ditu (ezkerrean, atzealdean, gainera, bestalde).',
        4: 'Kohesio fina lortzen du espazio-erreferente askotarikoekin eta aditz-barietatearekin errepikapenak saihestuz.',
      },
      es: {
        1: 'Carece de marcadores espaciales y repite sistemáticamente los mismos verbos ("tiene...", "es...").',
        2: 'Introduce algún marcador espacial básico, pero las estructuras sintácticas resultan repetitivas.',
        3: 'Usa conectores espaciales y aditivos variados (al fondo, a la derecha, además, por otro lado) con buen encaje.',
        4: 'Mantiene una cohesión fluida combinando marcadores espaciales, pronombres y variedad sintáctica sin repeticiones.',
      },
    },
    lexicon: {
      eu: {
        1: 'Adjektibo oso orokorrak (polita, handia, ona) soilik erabiltzen ditu.',
        2: 'Adjektibo arrunt batzuk sartzen ditu, baina zehaztasun sentsorial gutxirekin.',
        3: 'Adjektibo zehatzak, ñabardurak eta zentzumenetako erreferentziak (koloreak, formak, soinuak) egoki erabiltzen ditu.',
        4: 'Hiztegi deskribatzaile aberatsa, adjektibo zehatzak, adberbioak eta baliabide estilistikoak (konparazioak, metaforak) trebetasunez erabiliz.',
      },
      es: {
        1: 'Se limita a adjetivos muy genéricos (bonito, grande, bueno) sin precisión.',
        2: 'Utiliza algunos adjetivos adecuados, aunque con escasos detalles sensoriales.',
        3: 'Emplea adjetivos precisos y vocabulario sensorial (colores, texturas, sonidos, olores) bien seleccionados.',
        4: 'Despliega un léxico descriptivo rico y matizado, integrando comparaciones o metáforas con naturalidad.',
      },
    },
  },
  expository: {
    adequacy: {
      eu: {
        1: 'Ez du informazio objektiborik ematen edo iritzi pertsonalekin nahasten du gaia azaldu gabe.',
        2: 'Gaiari buruzko datu batzuk ematen ditu, baina erregistroa lagunartekoegia da edo ez dago argi azalduta.',
        3: 'Helburu informatibo-dibulgatzailera egokitzen da, tonu objektiboarekin eta hartzailearentzat ulergarri.',
        4: 'Azalpen argi, zorrotz eta didaktikoa egiten du, tonu objektibo egokian eta irakurlearen ulermena erraztuz.',
      },
      es: {
        1: 'No informa de manera objetiva sobre el tema o confunde la exposición con una opinión personal.',
        2: 'Aporta datos relacionados con el tema, pero con registro demasiado coloquial o poca claridad divulgativa.',
        3: 'Se ajusta al propósito informativo y divulgativo con registro adecuado, claro y objetivo.',
        4: 'Comunica la información con rigor, claridad didáctica y registro formal-divulgativo plenamente adecuado a 6º EP.',
      },
    },
    coherence: {
      eu: {
        1: 'Informazioa nahasia edo desordenatua da; ez dago sarrerarik, garapenik edo ideia nagusien bereizketarik.',
        2: 'Ideia nagusi batzuk agertzen dira, baina azpiatalak edo ondorioa falta dira edo gaizki antolatuta daude.',
        3: 'Egitura argia du (izenburua, sarrera, garapena azpiataletan edo paragrafo tematikotan eta laburpen/ondorioa).',
        4: 'Antolaketa bikaina du: izenburua, sarrera erakargarria, paragrafo bakoitzean ideia nagusi bat adibideekin eta ondorio sintetikoa.',
      },
      es: {
        1: 'Presenta datos sueltos sin jerarquía ni estructura (falta introducción, desarrollo y cierre).',
        2: 'Expone ideas válidas, pero agrupa mal la información en párrafos o omite introducción/conclusión.',
        3: 'Organiza claramente título, introducción, desarrollo por subtemas/párrafos y conclusión o cierre.',
        4: 'Estructura impecable con jerarquización clara de ideas principales y secundarias, ejemplos pertinentes y cierre sintetizador.',
      },
    },
    cohesion: {
      eu: {
        1: 'Esaldiak loturarik gabe daude eta ez dira azalpen-lokailuak erabiltzen.',
        2: 'Oinarrizko lokailu gutxi batzuk erabiltzen ditu azalpenak edo adibideak sartzeko.',
        3: 'Azalpen-lokailuak zuzen darabiltza (adibidez, hau da, horrez gain, ondorioz, laburbilduz).',
        4: 'Paragrafoak eta ideiak modu naturalean lotzen ditu azalpen-, kausa- eta laburpen-antolatzaile aberatsekin.',
      },
      es: {
        1: 'No emplea conectores explicativos ni organizadores del discurso; el texto resulta fragmentado.',
        2: 'Usa algún conector básico (además, porque), pero falta fluidez entre bloques de información.',
        3: 'Emplea conectores explicativos, de orden y causa-efecto (es decir, por ejemplo, en primer lugar, por tanto).',
        4: 'Enlaza párrafos y conceptos con precisión usando marcadores explicativos, de ejemplificación y síntesis variados.',
      },
    },
    lexicon: {
      eu: {
        1: 'Gaiaren hiztegi espezifikorik ez du erabiltzen; hitz orokorregiak eta zehaztasunik gabeak.',
        2: 'Gaiari lotutako hitz zehatz gutxi batzuk sartzen ditu, baina batzuetan zehaztasunik gabe.',
        3: 'Gaiaren berezko lexiko zehatza eta LH6ko mailako termino tekniko ulergarriak egoki erabiltzen ditu.',
        4: 'Hiztegi espezifiko aberatsa eta zehatza darabil, behar denean terminoak argituz eta errepikapenak saihestuz.',
      },
      es: {
        1: 'Carece de vocabulario específico del tema y abusa de términos vagos ("cosa", "hacer", "eso").',
        2: 'Incorpora algunos términos del ámbito tratado, aunque con imprecisiones o repeticiones.',
        3: 'Utiliza vocabulario específico y preciso propio del tema trabajado, adecuado al nivel escolar.',
        4: 'Demuestra dominio del léxico divulgativo y técnico pertinente, aclarando conceptos cuando es necesario.',
      },
    },
  },
  argumentative: {
    adequacy: {
      eu: {
        1: 'Ez du iritzi argirik ematen edo ez da gai eztabaidagarrira egokitzen.',
        2: 'Iritzia adierazten du, baina ez du argi zein den bere jarrera edo tonua desegokia da.',
        3: 'Jarrera argia hartzen du gaiaren aurrean, irakurlea konbentzitzeko helburuari eta errespetuzko tonuari eutsiz.',
        4: 'Iritzi-artikulu sinesgarria eta heldutasunezkoa idazten du, hartzaileari zuzenduta eta helburu komunikatiboari guztiz egokitua.',
      },
      es: {
        1: 'No formula una postura u opinión clara ante el tema planteado.',
        2: 'Expresa una opinión, pero el tono es poco apropiado o el propósito persuasivo resulta débil.',
        3: 'Adopta una postura clara y respetuosa orientada a convencer o hacer reflexionar al lector.',
        4: 'Construye un artículo de opinión convincente y maduro, perfectamente adecuado al propósito persuasivo y al destinatario.',
      },
    },
    coherence: {
      eu: {
        1: 'Iritzia ematen du baina ez du argudiorik aurkezten, edo arrazoiak kontraesankorrak dira.',
        2: 'Argudio bakarra edo oso orokorra ematen du, tesiaren eta ondorioaren arteko egitura osatu gabe.',
        3: 'Egitura argia du: gaia eta tesia aurkeztea, gutxienez 2-3 argudio sendo adibideekin eta ondorio argia.',
        4: 'Tesi argia, argudio askotarikoak eta ondo arrazoituak (baita kontrako ikuspuntu bati erantzuna ere) eta ondorio indartsua.',
      },
      es: {
        1: 'Expone gustos personales sin razones que los respalden o con ideas contradictorias.',
        2: 'Aporta un único argumento poco desarrollado, sin estructurar claramente tesis y conclusión.',
        3: 'Presenta tesis clara, 2 o 3 argumentos pertinentes apoyados en ejemplos y una conclusión coherente.',
        4: 'Desarrolla tesis definida, argumentos sólidos y variados (incluyendo matices o contraargumentos sencillos) y cierre contundente.',
      },
    },
    cohesion: {
      eu: {
        1: 'Ez du argudio-lokailurik erabiltzen; arrazoiak loturarik gabe pilatzen ditu.',
        2: 'Oinarrizko lokailu bakar batzuk darabiltza ("baina", "eta", "horregatik").',
        3: 'Argudio- eta aurkaritza-lokailuak egoki erabiltzen ditu (alde batetik, bestalde, hala ere, beraz, nire ustez).',
        4: 'Diskurtso-antolatzaile aberatsak darabiltza argudioak hierarkizatzeko, kontrajartzeko eta ondorioztatzeko.',
      },
      es: {
        1: 'Carece de conectores argumentativos; enumera ideas sin relación lógica explícita.',
        2: 'Usa solo conectores elementales ("pero", "porque") con escasa variedad.',
        3: 'Emplea conectores argumentativos, de contraste y consecuencia (en primer lugar, sin embargo, por consiguiente, en conclusión).',
        4: 'Articula el razonamiento con fluidez mediante marcadores de opinión, contraste, refuerzo y conclusión variados.',
      },
    },
    lexicon: {
      eu: {
        1: 'Hiztegi pobrea eta lagunartekoegia, argudioak sendotzeko baliabiderik gabe.',
        2: 'Hiztegi egokia baina xumea; iritzia adierazteko formula bera errepikatzen du.',
        3: 'Iritzia eta balorazioa adierazteko hiztegi zehatza eta adierazkorra darabil (funtsezkoa, kaltegarria, beharrezkoa).',
        4: 'Hiztegi aberatsa eta pertsuasiboa, balorazio-hitz zehatzak eta erretorika-baliabide egokiak (galdera erretorikoak, adibidez) erabiliz.',
      },
      es: {
        1: 'Vocabulario pobre o excesivamente coloquial que resta fuerza a los argumentos.',
        2: 'Léxico comprensible pero repetitivo al expresar la opinión ("yo creo que...").',
        3: 'Usa vocabulario preciso y valorativo adecuado al debate (imprescindible, beneficioso, perjudicial, proponer).',
        4: 'Maneja un léxico rico y persuasivo con expresiones valorativas precisas y recursos eficaces como preguntas retóricas.',
      },
    },
  },
  instructive: {
    adequacy: {
      eu: {
        1: 'Testuak ez du jarduera edo araua betetzeko balio; jarraibideak falta dira edo ulertezinak dira.',
        2: 'Helburu instruitzailea betetzen saiatzen da, baina zenbait pauso edo datu garrantzitsu ahazten ditu.',
        3: 'Helburura egokitzen da: irakurleak testua jarraituz prozesua edo jokoa osatu dezake.',
        4: 'Jarraibide erabat argiak, praktikoak eta hartzailearentzat zehatzak eskaintzen ditu, zalantzarik utzi gabe.',
      },
      es: {
        1: 'El texto no permite llevar a cabo la actividad o receta porque faltan indicaciones esenciales.',
        2: 'Se orienta a dar instrucciones, pero omite pasos o datos importantes para completar el proceso.',
        3: 'Cumple bien el propósito instructivo: cualquier lector puede seguir los pasos con éxito.',
        4: 'Ofrece instrucciones claras, completas y prácticas, anticipando posibles dudas o consejos útiles.',
      },
    },
    coherence: {
      eu: {
        1: 'Pausoak nahastuta daude eta ez ditu bereizten izenburua, materialak/osagaiak eta prozedura.',
        2: 'Atal batzuk bereizten ditu, baina pausoen ordena kronologikoan jauziak edo hutsuneak daude.',
        3: 'Egitura egokia du: izenburua, beharrezko materialak/osagaiak eta pauso ordenatuak (zenbakituta edo zerrendatuta).',
        4: 'Egitura eredugarria eta bisualki argia: izenburua, material zehatzak neurriekin, sekuentzia kronologiko perfektua eta oharrak/aholkuak.',
      },
      es: {
        1: 'Mezcla pasos sin orden cronológico y no separa materiales/ingredientes del procedimiento.',
        2: 'Incluye partes del formato instructivo, pero hay saltos de orden o falta algún elemento clave.',
        3: 'Estructura clara con título, lista de materiales/ingredientes y pasos ordenados cronológicamente.',
        4: 'Formato impecable y muy visual: título, materiales precisos con cantidades, secuencia lógica exacta y recomendaciones finales.',
      },
    },
    cohesion: {
      eu: {
        1: 'Ez du ordena-antolatzailerik erabiltzen eta aditz-formak modu desegokian nahasten ditu.',
        2: 'Ordena-hitzen bat erabiltzen du, baina aditz-modua (agintera/infinitiboa) ez da koherentea pauso guztietan.',
        3: 'Ordena-lokailuak (lehenik, jarraian, ondoren, azkenik) eta agintera/infinitibo koherentea erabiltzen ditu.',
        4: 'Sekuentzia oso arina da; denbora- eta baldintza-lokailu zehatzak darabiltza eta aditz-forma instruitzailea uniformeki mantentzen du.',
      },
      es: {
        1: 'Carece de marcadores de orden y mezcla formas verbales de manera confusa.',
        2: 'Utiliza algún marcador de orden, pero alterna sin criterio imperativo, infinitivo y otras formas verbales.',
        3: 'Emplea conectores de secuencia (en primer lugar, a continuación, después, por último) y formas verbales coherentes.',
        4: 'Mantiene uniformidad impecable en el modo verbal (imperativo o infinitivo) y enlaza pasos con conectores temporales y condicionales precisos.',
      },
    },
    lexicon: {
      eu: {
        1: 'Ekintza-aditz eta neurri oso zehaztugabeak ("jarri pixka bat", "egin hori").',
        2: 'Oinarrizko ekintza-aditzak erabiltzen ditu, baina zehaztasun tekniko gutxirekin.',
        3: 'Ekintza-aditz zehatzak (nahastu, moztu, tolestu, banatu) eta neurri/tresna izen egokiak erabiltzen ditu.',
        4: 'Hiztegi zehatz eta espezifikoa (ekintza-aditz aberatsak, neurri zehatzak eta segurtasun- edo kalitate-zehaztapenak).',
      },
      es: {
        1: 'Emplea verbos vagos y medidas imprecisas ("echa un poco", "haz eso").',
        2: 'Usa verbos de acción sencillos, aunque con poca precisión en utensilios o cantidades.',
        3: 'Selecciona verbos de acción concretos (mezclar, doblar, recortar, repartir) y términos precisos del ámbito.',
        4: 'Aplica un léxico técnico y operativo muy preciso, con cantidades exactas y matices claros de ejecución.',
      },
    },
  },
  epistolary: {
    adequacy: {
      eu: {
        1: 'Ez du hartzailea kontuan hartzen eta ez du erregistro formala eta informala bereizten.',
        2: 'Helburua ulertzen da, baina tratu-erregistroan gorabeherak ditu (formaletik informalera pasatuz).',
        3: 'Helburura (eskaera, gonbidapena, kontatzea) eta hartzailera egokitutako erregistro formala edo informala mantentzen du.',
        4: 'Adeitasuna, erregistroa eta helburu komunikatiboa bikain kontrolatzen ditu, gutun/mezu erreal eta sinesgarria osatuz.',
      },
      es: {
        1: 'No se adapta al destinatario ni distingue entre registro formal e informal.',
        2: 'Transmite el motivo del mensaje, pero mezcla tratamientos (tú/usted) o fórmulas inadecuadas al contexto.',
        3: 'Mantiene de forma consistente el registro formal o informal según el destinatario y el propósito.',
        4: 'Domina el registro, la cortesía y el tono adecuados al destinatario, logrando una carta o correo totalmente verosímil.',
      },
    },
    coherence: {
      eu: {
        1: 'Ez du gutunaren edo mezu elektronikoaren ohiko egitura errespetatzen (agurra, gorputza edo sinadura falta dira).',
        2: 'Atal nagusi batzuk agertzen dira, baina gaia/data, agur-formula edo gorputzeko paragrafoak osatu gabe daude.',
        3: 'Egitura osoa betetzen du: lekua/data edo gaia, hasierako agurra, mezuaren gorputza paragrafo argietan, amaierako agurra eta sinadura.',
        4: 'Egitura epistolarra zehatz-mehatz betetzen du, gorputzean arrazoia, garapena eta eskaera/amaiera ezin hobeto antolatuta.',
      },
      es: {
        1: 'Omite la mayoría de las partes propias del género epistolar (saludo, cuerpo, despedida o firma).',
        2: 'Incluye algunas partes del formato, pero falta fecha/asunto o el cuerpo está mal organizado.',
        3: 'Cumple la estructura completa: lugar/fecha o asunto, saludo, cuerpo organizado en párrafos, despedida y firma.',
        4: 'Estructura epistolar completa y cuidada, organizando en el cuerpo el motivo, el desarrollo y el cierre de forma ejemplar.',
      },
    },
    cohesion: {
      eu: {
        1: 'Paragrafoen artean ez dago loturarik eta esaldiak modu zakarrean kateatzen dira.',
        2: 'Oinarrizko lokailu batzuk darabiltza, baina hasierako eta amaierako trantsizioak behartuak dira.',
        3: 'Mezua arin garatzen da lokailu egokiekin eta hartzailearekiko erreferentzia koherenteekin.',
        4: 'Kohesio natural eta adeitsua du, mezuaren atalak trantsizio dotore eta lokailu aberatsekin lotuz.',
      },
      es: {
        1: 'Presenta ideas inconexas sin conectores ni continuidad entre párrafos.',
        2: 'Utiliza conectores sencillos, pero la transición entre el motivo del mensaje y la despedida es brusca.',
        3: 'Enlaza con fluidez los párrafos mediante conectores adecuados y mantiene coherente el trato al destinatario.',
        4: 'Logra una cohesión muy cuidada, articulando cortesía, motivo y cierre con conectores precisos y naturales.',
      },
    },
    lexicon: {
      eu: {
        1: 'Hiztegi pobrea edo testuingururako desegokia; agur-formulak falta dira.',
        2: 'Oinarrizko hiztegia eta formula arruntak erabiltzen ditu, barietate gutxirekin.',
        3: 'Erregistroari dagozkion kortesia- eta agur-formulak (Jaun/Andre agurgarria, Eskerrik asko aldez aurretik, Besarkada bat) eta lexiko egokia erabiltzen ditu.',
        4: 'Hiztegi zehatza, adeitsua eta erregistroarekin guztiz bat datorrena, kortesia-esamolde aberatsekin.',
      },
      es: {
        1: 'Vocabulario pobre o impropio de la situación comunicativa; carece de fórmulas de saludo/despedida.',
        2: 'Usa vocabulario correcto pero muy básico y fórmulas repetitivas.',
        3: 'Aplica fórmulas de cortesía, saludo y despedida acordes al registro (Estimado/a, Reciba un cordial saludo, Un abrazo) y léxico adecuado.',
        4: 'Selecciona un léxico cuidado, variado y cortés que refleja con precisión el grado de formalidad requerido.',
      },
    },
  },
  journalistic: {
    adequacy: {
      eu: {
        1: 'Ez du albiste-formatua edo tonu informatibo objektiboa errespetatzen; ipuin edo iritzi hutsa dirudi.',
        2: 'Gertakari baten berri ematen du, baina iritzi pertsonalak sartzen ditu edo titularrak ez du albistea laburbiltzen.',
        3: 'Kazetaritza-helburura eta tonu objektibora ondo egokitzen da, 3. pertsona erabiliz eta datu garrantzitsuak nabarmenduz.',
        4: 'Albiste sinesgarria, objektiboa eta erakargarria idazten du, kazetaritza-estiloa eta irakurlearen arreta bikain uztartuz.',
      },
      es: {
        1: 'No responde al género periodístico informativo; adopta tono de cuento o mezcla opiniones personales sin hechos.',
        2: 'Informa de un suceso, pero incluye juicios subjetivos o un titular poco informativo.',
        3: 'Se adecua bien al propósito informativo y al tono objetivo en 3.ª persona propio de la noticia.',
        4: 'Redacta una noticia verosímil, objetiva y atractiva que capta el interés del lector con auténtico estilo periodístico.',
      },
    },
    coherence: {
      eu: {
        1: 'Ez ditu albistearen atalak (titularra, sarrera, gorputza) bereizten eta 6W galdera gehienak erantzun gabe geratzen dira.',
        2: 'Titularra eta gorputza ditu, baina sarrerak (lead) ez ditu oinarrizko galderak laburbiltzen edo datuak desordenatuta daude.',
        3: 'Egitura egokia du: titular deigarria, sarrera (Zer, Nor, Non, Noiz) eta gorputza garrantzitsuenetik xehetasunetara (piramide alderantzikatua).',
        4: 'Piramide alderantzikatua bikain aplikatzen du: titularra, azpititularra/sarrera 6W galderekin, gorputz ordenatua eta lekukoen adierazpenak.',
      },
      es: {
        1: 'No diferencia titular, entradilla y cuerpo; faltan la mayoría de los datos esenciales (qué, quién, dónde, cuándo).',
        2: 'Incluye titular y texto, pero la entradilla no sintetiza lo esencial o el orden informativo es confuso.',
        3: 'Organiza correctamente titular, entradilla (responde a qué, quién, dónde y cuándo) y cuerpo con detalles (pirámide invertida).',
        4: 'Aplica con maestría la pirámide invertida: titular gancho, entradilla completa (6W), cuerpo jerarquizado y citas o datos de contexto.',
      },
    },
    cohesion: {
      eu: {
        1: 'Paragrafoak ez daude lotuta eta esaldi luzeegiak edo puntuaziorik gabeak ageri dira.',
        2: 'Oinarrizko lokailu batzuk darabiltza, baina izen edo datu berberak gehiegi errepikatzen dira.',
        3: 'Paragrafo labur eta argiak lotzen ditu kazetaritza-lokailuekin (bestalde, gainera, antolatzaileen esanetan, horren ondorioz).',
        4: 'Kohesio arina eta kazetaritza-erritmo bikaina du, sinonimoak, erreferenteak eta zehar-estiloa trebetasunez erabiliz.',
      },
      es: {
        1: 'Párrafos inconexos o bloques demasiado largos sin conectores ni fluidez informativa.',
        2: 'Emplea nexos simples, pero repite continuamente los mismos nombres o datos en cada párrafo.',
        3: 'Enlaza párrafos breves y claros con conectores periodísticos (además, según fuentes, por otro lado, a raíz de esto).',
        4: 'Demuestra gran cohesión periodística mediante sustituciones léxicas, conectores precisos e integración fluida de citas.',
      },
    },
    lexicon: {
      eu: {
        1: 'Hiztegi oso lagunartekoa edo zehaztasunik gabea kazetaritza-testu baterako.',
        2: 'Hiztegi ulergarria baina xumea, datu-zehaztasun edo kazetaritza-esamolde gutxirekin.',
        3: 'Hiztegi argia, zehatza eta objektiboa erabiltzen du, gertakariaren arloko hitz egokiekin.',
        4: 'Hiztegi informatibo aberatsa eta zehatza, titular indartsua eta kazetaritza-adierazpide egokiak darabiltza.',
      },
      es: {
        1: 'Léxico demasiado informal o impreciso para una noticia escolar.',
        2: 'Vocabulario correcto pero sencillo, con escasa precisión informativa.',
        3: 'Utiliza vocabulario claro, preciso y objetivo, adecuado al tema de la noticia.',
        4: 'Combina un titular preciso y atractivo con léxico periodístico rico, exacto y libre de repeticiones.',
      },
    },
  },
};

export function createBaseReadingRubric(lang: Language): Rubric {
  const now = new Date().toISOString();
  if (lang === 'eu') {
    return {
      id: 'base-reading-eu',
      title: 'Irakurmenaren Ulermena · Oinarrizko Errubrika (LH6)',
      asignatura: 'euskera',
      skill: 'reading',
      language: 'eu',
      isBase: true,
      createdAt: now,
      updatedAt: now,
      criteria: [
        {
          id: 'read-eu-1',
          code: 'CE4.1',
          name: 'Informazio esplizituaren kokapena',
          weight: 2.5,
          levels: {
            1: 'Zailtasun handiak ditu testuan zuzenean agertzen diren datuak, izenak edo gertaerak aurkitzeko.',
            2: 'Datu esplizitu errazenak identifikatzen ditu, baina zehaztasuna galtzen du galdera konplexuagoetan.',
            3: 'Testuan esplizituki agertzen diren datuak, xehetasunak eta gertaerak zuzen eta autonomiaz kokatzen ditu.',
            4: 'Informazio esplizitu guztia azkar eta zehaztasun osoz aurkitzen du, beharrezkoa denean testuko aipuekin justifikatuz.',
          },
        },
        {
          id: 'read-eu-2',
          code: 'CE4.2',
          name: 'Inferentzia eta interpretazioa',
          weight: 3.0,
          levels: {
            1: 'Ez ditu testuaren informazio inplizituak, pertsonaien asmoak edo kausa-ondorio harremanak ondorioztatzen.',
            2: 'Ondorio sinple batzuk ateratzen ditu laguntzarekin, baina zailtasunak ditu hitz ezezagunak testuingurutik ulertzeko.',
            3: 'Informazio inplizitua, kausa-ondorioak eta hitz ezezagunen esanahia testuingurutik egoki interpretatzen ditu.',
            4: 'Interpretazio sakona eta arrazoitua egiten du: autorearen asmoa, ironia/ñabardurak eta ondorio inplizituak zehaztasunez antzematen ditu.',
          },
        },
        {
          id: 'read-eu-3',
          code: 'CE4.3',
          name: 'Ulermen globala eta testu-egitura',
          weight: 2.5,
          levels: {
            1: 'Ez du testuaren gai nagusia identifikatzen eta ez ditu ideia nagusiak bigarren mailakoetatik bereizten.',
            2: 'Gai orokorra antzematen du, baina zailtasunak ditu testua laburbiltzeko edo atalak identifikatzeko.',
            3: 'Gai nagusia, testuaren helburua eta atal/ideia nagusiak zuzen identifikatzen eta laburbiltzen ditu.',
            4: 'Testuaren ikuspegi global osoa du: ideia nagusiak zehaztasunez sintetizatzen ditu, testu-mota bereizten du eta balorazio kritiko arrazoitua ematen du.',
          },
        },
        {
          id: 'read-eu-4',
          code: 'CE5.1',
          name: 'Erantzunen idazkera-kalitatea',
          weight: 2.0,
          levels: {
            1: 'Hitz solteekin edo testutik zuzenean kopiatuz erantzuten du, akats ortografiko ugarirekin.',
            2: 'Esaldi osoak idazten saiatzen da, baina erantzunak osatu gabeak dira edo adierazpen-/ortografia-akats nabarmenak dituzte.',
            3: 'Bere hitzekin, esaldi osoekin, argitasunez eta LH6ko ortografia zuzenarekin idazten ditu erantzunak.',
            4: 'Erantzun osoak, ondo argudiatuak, hiztegi aberatsekoak eta zuzentasun ortografiko-gramatikal bikainekoak idazten ditu.',
          },
        },
      ],
    };
  }

  return {
    id: 'base-reading-es',
    title: 'Comprensión Escrita · Rúbrica Base (6º EP)',
    asignatura: 'castellano',
    skill: 'reading',
    language: 'es',
    isBase: true,
    createdAt: now,
    updatedAt: now,
    criteria: [
      {
        id: 'read-es-1',
        code: 'CE4.1',
        name: 'Localización de información explícita',
        weight: 2.5,
        levels: {
          1: 'Presenta dificultades para localizar datos, personajes o hechos que aparecen literalmente en el texto.',
          2: 'Identifica información literal sencilla, pero omite detalles o comete imprecisiones en preguntas más largas.',
          3: 'Localiza con autonomía y precisión los datos, hechos y detalles explícitos solicitados.',
          4: 'Extrae toda la información explícita con exactitud, discriminando detalles relevantes y justificándolos en el texto.',
        },
      },
      {
        id: 'read-es-2',
        code: 'CE4.2',
        name: 'Inferencia e interpretación',
        weight: 3.0,
        levels: {
          1: 'No deduce información implícita, relaciones de causa-efecto ni intenciones de los personajes o del autor.',
          2: 'Realiza inferencias sencillas con apoyo, pero le cuesta deducir significados por contexto o ideas implícitas.',
          3: 'Interpreta correctamente relaciones de causa-efecto, vocabulario por contexto e información no explícita.',
          4: 'Realiza inferencias profundas y justificadas, detectando intención del autor, matices y relaciones complejas entre ideas.',
        },
      },
      {
        id: 'read-es-3',
        code: 'CE4.3',
        name: 'Comprensión global y estructura textual',
        weight: 2.5,
        levels: {
          1: 'No reconoce el tema principal ni distingue las ideas esenciales de los detalles secundarios.',
          2: 'Capta el tema general, pero presenta dificultades para resumir o reconocer cómo se organiza el texto.',
          3: 'Identifica el tema, propósito comunicativo, estructura e ideas principales sintetizándolas con claridad.',
          4: 'Demuestra comprensión global excelente: sintetiza con precisión, identifica el género y aporta valoración crítica argumentada.',
        },
      },
      {
        id: 'read-es-4',
        code: 'CE5.1',
        name: 'Calidad de la redacción en las respuestas',
        weight: 2.0,
        levels: {
          1: 'Responde con palabras sueltas o copiando fragmentos literales sin sentido completo y con numerosos errores.',
          2: 'Redacta oraciones simples, pero incompletas o con errores frecuentes de ortografía, puntuación y expresión.',
          3: 'Elabora respuestas completas con sus propias palabras, coherencia y correcta ortografía propia de 6º EP.',
          4: 'Redacta respuestas completas, claras y bien argumentadas, con vocabulario preciso y excelente corrección gramatical.',
        },
      },
    ],
  };
}

export function createBaseWritingRubric(typology: TextTypologyId, lang: Language): Rubric {
  const now = new Date().toISOString();
  const meta = TEXT_TYPOLOGIES.find((t) => t.id === typology) || TEXT_TYPOLOGIES[0];
  const spec = TYPOLOGY_DESCRIPTORS[typology];

  const names =
    lang === 'eu'
      ? {
          adequacy: 'Egokitasuna eta helburu komunikatiboa',
          coherence: `Koherentzia eta generoaren egitura (${meta.title.eu})`,
          cohesion: 'Kohesioa eta lokailuak',
          lexicon: 'Aberastasun lexikoa',
        }
      : {
          adequacy: 'Adecuación y propósito comunicativo',
          coherence: `Coherencia y estructura del género (${meta.title.es})`,
          cohesion: 'Cohesión y conectores',
          lexicon: 'Riqueza léxica',
        };

  return {
    id: `base-writing-${typology}-${lang}`,
    title:
      lang === 'eu'
        ? `${meta.title.eu} · Oinarrizko Errubrika (LH6)`
        : `${meta.title.es} · Rúbrica Base (6º EP)`,
    asignatura: lang === 'es' ? 'castellano' : 'euskera',
    skill: 'writing',
    typology,
    language: lang,
    isBase: true,
    createdAt: now,
    updatedAt: now,
    criteria: [
      {
        id: `w-${typology}-${lang}-1`,
        code: 'CE5.1',
        name: names.adequacy,
        weight: 2.0,
        levels: spec.adequacy[lang],
      },
      {
        id: `w-${typology}-${lang}-2`,
        code: 'CE5.1',
        name: names.coherence,
        weight: 2.5,
        levels: spec.coherence[lang],
      },
      {
        id: `w-${typology}-${lang}-3`,
        code: 'CE5.2',
        name: names.cohesion,
        weight: 1.5,
        levels: spec.cohesion[lang],
      },
      {
        id: `w-${typology}-${lang}-4`,
        code: 'CE5.2',
        name: names.lexicon,
        weight: 2.0,
        levels: spec.lexicon[lang],
      },
      getGrammarCriterion(lang),
    ],
  };
}

export function getBaseRubric(
  skill: SkillMode,
  lang: Language,
  typology: TextTypologyId = 'narrative'
): Rubric {
  if (skill === 'reading') {
    return createBaseReadingRubric(lang);
  }
  return createBaseWritingRubric(typology, lang);
}
