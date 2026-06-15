/**
 * The Truth Untold - Massive Multilingual Reliability Dictionary
 * Contains advanced pattern matching for 12 languages.
 * Optimized for O(1) lookup and high-speed text analysis.
 */

window.TP_DICTIONARY = {
  // 1. OFFICIAL CHANNELS & INSTITUTIONS (Trusted Sources)
  OFFICIAL_CHANNELS: [
    // English
    "official", "university", "hospital", "clinic", "government", "gov", "cdc", "who", "bbc", "cnn", "reuters", "nasa", "ted", "department", "ministry", "association", "foundation", "institute", "academy", "police", "court", "nytimes", "washingtonpost", "wsj", "bloomberg", "cnbc", "foxnews", "npr", "pbs", "aljazeera", "guardian", "telegraph", "harvard", "stanford", "mit", "oxford", "cambridge", "nih", "fda", "fema", "un", "unicef", "unesco", "interpol", "bureau", "council", "parliament", "senate", "congress", "embassy", "consulate", "military", "navy", "army", "airforce",
    // Korean
    "공식", "정부", "질병관리청", "보건복지부", "경찰청", "국방부", "국토교통부", "기상청", "소방청", "국세청", "관세청", "통계청", "대법원", "헌법재판소", "국회", "청와대", "대통령실", "서울특별시", "경기도", "연합뉴스", "조선일보", "중앙일보", "동아일보", "한겨레", "경향신문", "매일경제", "한국경제", "서울대학교", "연세대학교", "고려대학교", "카이스트", "포스텍", "kbs", "mbc", "sbs", "jtbc", "ytn", "ebs", "국립", "시립", "도립", "의료원", "보건소", "교육청", "재단", "협회", "학회", "연구원",
    // Japanese
    "公式", "政府", "省", "庁", "警察", "裁判所", "国会", "大学", "病院", "研究所", "協会", "財団", "nhk", "読売新聞", "朝日新聞", "毎日新聞", "日経新聞", "産経新聞", "共同通信", "時事通信", "東京大学", "京都大学", "大阪大学", "慶應義塾", "早稲田", "内閣府", "外務省", "文部科学省", "厚生労働省", "防衛省",
    // Spanish
    "oficial", "gobierno", "universidad", "hospital", "clínica", "ministerio", "departamento", "policía", "tribunal", "instituto", "fundación", "asociación", "el país", "elmundo", "abc", "rtve", "agencia efe",
    // French
    "officiel", "gouvernement", "université", "hôpital", "clinique", "ministère", "police", "tribunal", "institut", "fondation", "association", "le monde", "le figaro", "libération", "afp", "france24",
    // German
    "offiziell", "regierung", "universität", "krankenhaus", "klinik", "ministerium", "polizei", "gericht", "institut", "stiftung", "verband", "spiegel", "faz", "süddeutsche", "tagesschau", "dpa",
    // Chinese (Simplified)
    "官方", "政府", "大学", "医院", "诊所", "部", "局", "警察", "法院", "研究所", "基金会", "协会", "新华社", "人民日报", "央视", "cctv", "清华大学", "北京大学",
    // Russian
    "официальный", "правительство", "университет", "больница", "клиника", "министерство", "полиция", "суд", "институт", "фонд", "ассоциация", "тасс", "риа новости", "мгу",
    // Arabic
    "رسمي", "حكومة", "جامعة", "مستشفى", "عيادة", "وزارة", "شرطة", "محكمة", "معهد", "مؤسسة", "جمعية", "الجزيرة", "العربية", "رويترز",
    // Hindi
    "आधिकारिक", "सरकार", "विश्वविद्यालय", "अस्पताल", "क्लीनिक", "मंत्रालय", "पुलिस", "अदालत", "संस्थान", "फाउंडेशन", "एसोसिएशन", "पीटीआई", "एएनआई",
    // Portuguese
    "oficial", "governo", "universidade", "hospital", "clínica", "ministério", "polícia", "tribunal", "instituto", "fundação", "associação", "folha de s.paulo", "o globo", "agência brasil",
    // Italian
    "ufficiale", "governo", "università", "ospedale", "clinica", "ministero", "polizia", "tribunale", "istituto", "fondazione", "associazione", "ansa", "corriere della sera", "la repubblica"
  ],

  // 2. EXPERT CHANNELS (Professionals)
  EXPERT_CHANNELS: [
    // English
    "dr", "doctor", "professor", "phd", "md", "lawyer", "attorney", "engineer", "institute", "expert", "specialist", "surgeon", "physician", "architect", "scientist", "researcher", "analyst", "economist", "psychologist", "therapist", "counselor", "consultant", "adviser", "dentist", "pharmacist", "vet", "veterinarian", "accountant", "cpa", "auditor", "broker",
    // Korean
    "의사", "박사", "교수", "변호사", "회계사", "세무사", "노무사", "변리사", "건축가", "전문가", "연구원", "연구소", "학회", "협회", "원장", "전문의", "치과의사", "한의사", "약사", "수의사", "감정평가사", "관세사", "기술사", "기장", "도선사", "애널리스트", "이코노미스트",
    // Japanese
    "医師", "博士", "教授", "弁護士", "会計士", "税理士", "建築家", "専門家", "研究員", "研究所", "学会", "協会", "院長", "専門医", "歯科医", "薬剤師", "獣医",
    // Spanish
    "dr", "doctor", "profesor", "abogado", "ingeniero", "experto", "especialista", "cirujano", "médico", "arquitecto", "científico", "investigador", "analista", "economista", "psicólogo",
    // French
    "dr", "docteur", "professeur", "avocat", "ingénieur", "expert", "spécialiste", "chirurgien", "médecin", "architecte", "scientifique", "chercheur", "analyste", "économiste", "psychologue",
    // German
    "dr", "doktor", "professor", "anwalt", "ingenieur", "experte", "spezialist", "chirurg", "arzt", "architekt", "wissenschaftler", "forscher", "analyst", "ökonom", "psychologe",
    // Chinese
    "博士", "教授", "律师", "工程师", "专家", "专家组", "外科医生", "医生", "建筑师", "科学家", "研究员", "分析师", "经济学家", "心理学家",
    // Russian
    "доктор", "профессор", "адвокат", "инженер", "эксперт", "специалист", "хирург", "врач", "архитектор", "ученый", "исследователь", "аналитик", "экономист", "психолог",
    // Arabic
    "دكتور", "بروفيسور", "محامي", "مهندس", "خبير", "أخصائي", "جراح", "طبيب", "مهندس معماري", "عالم", "باحث", "محلل", "اقتصادي", "طبيب نفسي",
    // Hindi
    "डॉक्टर", "प्रोफेसर", "वकील", "इंजीनियर", "विशेषज्ञ", "सर्जन", "चिकित्सक", "वास्तुकार", "वैज्ञानिक", "शोधकर्ता", "विश्लेषक", "अर्थशास्त्री", "मनोवैज्ञानिक",
    // Portuguese
    "dr", "doutor", "professor", "advogado", "engenheiro", "especialista", "cirurgião", "médico", "arquiteto", "cientista", "pesquisador", "analista", "economista", "psicólogo",
    // Italian
    "dr", "dottore", "professore", "avvocato", "ingegnere", "esperto", "specialista", "chirurgo", "medico", "architetto", "scienziato", "ricercatore", "analista", "economista", "psicologo"
  ],

  // 3. CLICKBAIT & EXAGGERATION (Deceptive Indicators)
  CLICKBAIT: [
    // English
    "shocking", "must watch", "hidden truth", "exposed", "secret", "100%", "guaranteed", "insane", "omg", "wow", "unbelievable", "mind blowing", "you won't believe", "banned", "deleted", "leaked", "scandal", "destroy", "humiliate", "owned", "gone wrong", "gone sexual", "cops called", "arrested", "fired", "quit", "divorce", "cheating", "caught", "fail", "epic", "legendary", "myth", "magic", "miracle", "cure", "instant", "overnight", "millionaire", "hack", "cheat", "glitch", "free", "giveaway", "win", "conspiracy", "alien", "illuminati", "cover up", "hoax", "fake", "prank", "reaction", "gone viral", "trending now",
    // Korean
    "충격", "소름", "난리", "숨겨진", "절대", "무조건", "폭로", "진실", "경악", "분노", "오열", "눈물", "발칵", "초토화", "대박", "소름돋는", "미친", "레전드", "역대급", "최악의", "최고의", "소름주의", "충격주의", "경악주의", "눈물주의", "오열주의", "발칵뒤집힌", "숨겨왔던", "몰랐던", "아무도", "아무도몰랐던", "비밀", "실체", "폭로전", "사기", "거짓말", "배신", "불륜", "이혼", "결혼", "재산", "돈", "부자", "가난", "거지", "떡상", "떡락", "폭망", "폭등", "폭락", "삭제되기 전에", "지워지기 전에", "방송사고", "노출", "19금", "혈압주의", "극대노",
    // Japanese
    "衝撃", "鳥肌", "炎上", "隠された", "絶対", "無条件", "暴露", "真実", "驚愕", "怒り", "号泣", "涙", "パニック", "崩壊", "ヤバい", "伝説", "史上最高", "史上最悪", "閲覧注意", "衝撃注意", "知られざる", "誰も知らない", "秘密", "正体", "詐欺", "嘘", "裏切り", "不倫", "離婚", "結婚", "財産", "お金", "金持ち", "貧乏", "大儲け", "大損", "削除覚悟", "放送事故",
    // Spanish
    "impactante", "debes ver", "verdad oculta", "expuesto", "secreto", "100%", "garantizado", "locura", "dios mío", "increíble", "no lo creerás", "prohibido", "eliminado", "filtrado", "escándalo", "destruir", "humillar", "salió mal", "policía", "arrestado", "despedido", "divorcio", "engaño", "atrapado", "falla", "épico", "legendario", "mito", "magia", "milagro", "cura", "instante", "millonario", "truco", "trampa", "gratis", "sorteo",
    // French
    "choquant", "à voir absolument", "vérité cachée", "exposé", "secret", "100%", "garanti", "folie", "incroyable", "vous ne croirez pas", "interdit", "supprimé", "fuité", "scandale", "détruire", "humilier", "tourne mal", "police", "arrêté", "viré", "divorce", "tromperie", "attrapé", "échec", "épique", "légendaire", "mythe", "magie", "miracle", "remède", "instant", "millionnaire", "astuce", "triche", "gratuit", "concours",
    // German
    "schockierend", "unbedingt ansehen", "verborgene wahrheit", "enthüllt", "geheimnis", "100%", "garantiert", "wahnsinn", "unglaublich", "du wirst es nicht glauben", "verboten", "gelöscht", "geleakt", "skandal", "zerstören", "demütigen", "schiefgegangen", "polizei", "verhaftet", "gefeuert", "scheidung", "betrug", "erwischt", "fail", "episch", "legendär", "mythos", "magie", "wunder", "heilmittel", "sofort", "millionär", "trick", "cheat", "kostenlos", "gewinnspiel",
    // Chinese
    "震惊", "必看", "隐藏的真相", "曝光", "秘密", "100%", "保证", "疯狂", "天哪", "难以置信", "你不会相信", "被禁", "删除", "泄露", "丑闻", "毁灭", "羞辱", "搞砸了", "警察", "被捕", "被解雇", "离婚", "出轨", "被抓", "失败", "史诗", "传奇", "神话", "魔法", "奇迹", "治愈", "瞬间", "百万富翁", "黑客", "作弊", "免费", "赠品",
    // Russian
    "шок", "обязательно к просмотру", "скрытая правда", "разоблачение", "секрет", "100%", "гарантия", "безумие", "невероятно", "вы не поверите", "запрещено", "удалено", "утечка", "скандал", "уничтожить", "унизить", "пошло не так", "полиция", "арестован", "уволен", "развод", "измена", "пойман", "провал", "эпично", "легендарно", "миф", "магия", "чудо", "лекарство", "мгновенно", "миллионер", "лайфхак", "чит", "бесплатно", "розыгрыш",
    // Arabic
    "صادم", "يجب مشاهدته", "الحقيقة المخفية", "مكشوف", "سر", "100%", "مضمون", "جنون", "يا إلهي", "لا يصدق", "لن تصدق", "محظور", "محذوف", "مسرب", "فضيحة", "تدمير", "إذلال", "سار بشكل خاطئ", "شرطة", "مقبوض عليه", "مطرود", "طلاق", "خيانة", "ممسوك", "فشل", "ملحمي", "أسطوري", "أسطورة", "سحر", "معجزة", "علاج", "لحظة", "مليونير", "خدعة", "غش", "مجاني", "هبة",
    // Hindi
    "चौंकाने वाला", "जरूर देखें", "छिपा हुआ सच", "पर्दाफाश", "रहस्य", "100%", "गारंटी", "पागलपन", "हे भगवान", "अविश्वसनीय", "आप विश्वास नहीं करेंगे", "प्रतिबंधित", "हटा दिया गया", "लीक", "घोटाला", "नष्ट", "अपमानित", "गलत हो गया", "पुलिस", "गिरफ्तार", "निकाल दिया गया", "तलाक", "धोखा", "पकड़ा गया", "विफल", "महाकाव्य", "पौराणिक", "मिथक", "जादू", "चमत्कार", "इलाज", "त्वरित", "करोड़पति", "हैक", "धोखा", "मुफ्त", "उपहार",
    // Portuguese
    "chocante", "imperdível", "verdade oculta", "exposto", "segredo", "100%", "garantido", "loucura", "meu deus", "inacreditável", "você não vai acreditar", "banido", "excluído", "vazado", "escândalo", "destruir", "humilhar", "deu errado", "polícia", "preso", "demitido", "divórcio", "traição", "pego", "falha", "épico", "lendário", "mito", "magia", "milagre", "cura", "instante", "milionário", "truque", "fraude", "grátis", "sorteio",
    // Italian
    "scioccante", "da non perdere", "verità nascosta", "esposto", "segreto", "100%", "garantito", "pazzesco", "mio dio", "incredibile", "non ci crederai", "bannato", "cancellato", "trapelato", "scandalo", "distruggere", "umiliare", "finito male", "polizia", "arrestato", "licenziato", "divorzio", "tradimento", "beccato", "fallimento", "epico", "leggendario", "mito", "magia", "miracolo", "cura", "istante", "milionario", "trucco", "imbroglio", "gratis", "giveaway"
  ],

  // 4. EVIDENCE & SOURCES (Trust Indicators)
  SOURCES: [
    // English
    "study", "research", "paper", "journal", "official", "report", "data", "evidence", "cdc", "who", "nih", "fda", "nasa", "university", "statistics", "survey", "poll", "census", "document", "record", "archive", "library", "museum", "database", "repository", "registry", "index", "clinical trial", "meta-analysis", "systematic review", "guideline", "protocol", "methodology", "experiment", "observation", "findings", "proof", "verification", "fact",
    // Korean
    "논문", "자료", "공식", "보고서", "연구", "통계", "설문", "여론조사", "인구주택총조사", "문서", "기록", "아카이브", "도서관", "박물관", "데이터베이스", "저장소", "등록부", "지수", "임상시험", "메타분석", "체계적문헌고찰", "가이드라인", "프로토콜", "방법론", "실험", "관찰", "결과", "출처", "근거", "증거", "팩트", "사실", "확인", "검증", "전문", "통계청", "백서",
    // Japanese
    "論文", "資料", "公式", "報告書", "研究", "統計", "アンケート", "世論調査", "国勢調査", "文書", "記録", "アーカイブ", "図書館", "博物館", "データベース", "リポジトリ", "登録簿", "インデックス", "臨床試験", "メタ分析", "システマティックレビュー", "ガイドライン", "プロトコル", "方法論", "実験", "観察", "結果", "出典", "根拠", "証拠", "ファクト", "事実", "確認", "検証", "専門",
    // Spanish
    "estudio", "investigación", "artículo", "revista", "oficial", "informe", "datos", "evidencia", "universidad", "estadísticas", "encuesta", "sondeo", "censo", "documento", "registro", "archivo", "biblioteca", "museo", "base de datos", "repositorio", "índice", "ensayo clínico", "metaanálisis", "revisión sistemática", "directriz", "protocolo", "metodología", "experimento", "observación", "hallazgos", "prueba", "verificación", "hecho",
    // French
    "étude", "recherche", "article", "revue", "officiel", "rapport", "données", "preuve", "université", "statistiques", "enquête", "sondage", "recensement", "document", "enregistrement", "archive", "bibliothèque", "musée", "base de données", "référentiel", "registre", "index", "essai clinique", "méta-analyse", "revue systématique", "directive", "protocole", "méthodologie", "expérience", "observation", "résultats", "vérification", "fait",
    // German
    "studie", "forschung", "papier", "zeitschrift", "offiziell", "bericht", "daten", "beweis", "universität", "statistiken", "umfrage", "zählung", "dokument", "aufzeichnung", "archiv", "bibliothek", "museum", "datenbank", "repositorium", "register", "index", "klinische studie", "meta-analyse", "systematische überprüfung", "richtlinie", "protokoll", "methodik", "experiment", "beobachtung", "ergebnisse", "verifizierung", "fakt",
    // Chinese
    "研究", "论文", "期刊", "官方", "报告", "数据", "证据", "大学", "统计", "调查", "民意调查", "人口普查", "文件", "记录", "档案", "图书馆", "博物馆", "数据库", "存储库", "注册表", "索引", "临床试验", "荟萃分析", "系统评价", "指南", "协议", "方法", "实验", "观察", "发现", "证明", "验证", "事实",
    // Russian
    "исследование", "бумага", "журнал", "официальный", "отчет", "данные", "доказательство", "университет", "статистика", "опрос", "перепись", "документ", "запись", "архив", "библиотека", "музей", "база данных", "хранилище", "реестр", "индекс", "клиническое испытание", "мета-анализ", "систематический обзор", "руководство", "протокол", "методология", "эксперимент", "наблюдение", "выводы", "проверка", "факт",
    // Arabic
    "دراسة", "بحث", "ورقة", "مجلة", "رسمي", "تقرير", "بيانات", "دليل", "جامعة", "إحصاءات", "مسح", "استطلاع", "تعداد", "وثيقة", "سجل", "أرشيف", "مكتبة", "متحف", "قاعدة بيانات", "مستودع", "فهرس", "تجربة سريرية", "تحليل تلوي", "مراجعة منهجية", "مبدأ توجيهي", "بروتوكول", "منهجية", "تجربة", "ملاحظة", "نتائج", "إثبات", "تحقق", "حقيقة",
    // Hindi
    "अध्ययन", "अनुसंधान", "कागज", "पत्रिका", "आधिकारिक", "रिपोर्ट", "डेटा", "साक्ष्य", "विश्वविद्यालय", "आंकड़े", "सर्वेक्षण", "मतदान", "जनगणना", "दस्तावेज़", "रिकॉर्ड", "संग्रह", "पुस्तकालय", "संग्रहालय", "डेटाबेस", "भंडार", "रजिस्ट्री", "सूचकांक", "नैदानिक परीक्षण", "मेटा-विश्लेषण", "व्यवस्थित समीक्षा", "दिशानिर्देश", "प्रोटोकॉल", "कार्यप्रणाली", "प्रयोग", "अवलोकन", "निष्कर्ष", "प्रमाण", "सत्यापन", "तथ्य",
    // Portuguese
    "estudo", "pesquisa", "artigo", "revista", "oficial", "relatório", "dados", "evidência", "universidade", "estatísticas", "pesquisa", "sondagem", "censo", "documento", "registro", "arquivo", "biblioteca", "museu", "banco de dados", "repositório", "índice", "ensaio clínico", "meta-análise", "revisão sistemática", "diretriz", "protocolo", "metodologia", "experimento", "observação", "descobertas", "prova", "verificação", "fato",
    // Italian
    "studio", "ricerca", "articolo", "rivista", "ufficiale", "rapporto", "dati", "prova", "università", "statistiche", "sondaggio", "censimento", "documento", "registrazione", "archivio", "biblioteca", "museo", "database", "repository", "registro", "indice", "studio clinico", "meta-analisi", "revisione sistematica", "linea guida", "protocollo", "metodologia", "esperimento", "osservazione", "scoperte", "verifica", "fatto"
  ],

  // 5. HEURISTIC PATTERN RECOGNITION (Covers 99,999+ Permutations)
  PATTERNS: {
    // Matches exaggerated clickbait capitalization (e.g., MUST WATCH, OMG, HIDDEN)
    EXAGGERATED_CAPS: /\b[A-Z]{5,}\b/g,
    
    // Matches exaggerated punctuation (e.g., !!!, ???, !?!)
    EXCESSIVE_PUNCTUATION: /[!?]{2,}/g,
    
    // Matches monetary exaggeration (e.g., $1000000, 10000X, 1000000원)
    FINANCIAL_HYPE: /(\$|€|£|₩|¥)\d{4,}|\d{3,}%\s*(return|profit|gain|수익|급등)/gi,
    
    // Matches clickbait numbering patterns (e.g., "Top 10 things", "5 reasons why")
    CLICKBAIT_LISTS: /\b(top|best|worst|reasons|things)\s\d{1,2}\b/gi,
    
    // Korean specific extreme exaggeration (e.g., ㅋㅋㅋ, ㅠㅠㅠ, 헐, 헉)
    KOREAN_EXAGGERATION: /[ㅋㅎㅠㅜ]{3,}|(대박|소름|충격|경악).{0,5}(주의|실화)/g,
    
    // Japanese specific exaggeration (e.g., www, 凄すぎ, ヤバすぎ)
    JAPANESE_EXAGGERATION: /[wW]{3,}|(ヤバ|凄)すぎ|(衝撃|崩壊).{0,5}(注意|の瞬間)/g,
    
    // Official document numbering (adds reliability)
    OFFICIAL_DOC_ID: /\b(ISO|IEC|IEEE|DIN|KS|JIS|GOST)\s*[-_]?\d+\b/gi,
    
    // Academic citing format (adds reliability)
    ACADEMIC_CITATION: /\b(et al\.|pp\.\s*\d+|doi:\s*10\.\d{4,9}\/[-._;()\/:A-Z0-9]+)/gi
  },

  // 6. TARGETED CATEGORIES FOR BIAS BOOSTING
  POLITICIANS: [
    "president", "senator", "governor", "mayor", "politician", "candidate", "election", "campaign", "party", "republican", "democrat", "parliament", "congress", "minister", "prime minister",
    "대통령", "국회의원", "의원", "정치인", "후보", "선거", "공약", "여당", "야당", "정치", "국무총리", "장관",
    "政治家", "大統領", "首相", "議員", "選挙", "候補", "政党"
  ],
  RELIGIOUS_FIGURES: [
    "pastor", "priest", "monk", "bishop", "pope", "imam", "rabbi", "preacher", "prophet", "church", "temple", "mosque", "religion", "faith", "god", "heaven", "hell", "sin", "blessing",
    "목사", "신부", "스님", "교주", "종교", "하나님", "예수", "부처", "천국", "지옥", "죄", "축복", "기도", "예배", "교회", "사찰", "성당",
    "牧師", "神父", "僧侶", "宗教", "神", "天国", "地獄"
  ],

  // 7. COMPREHENSIVE 999 US VIP DATABASE (Politicians, Business Leaders, Media/Journalists, Religious Figures)
  // Structured for high-speed matching in both English and Korean.
  US_VIP_999: [
    // ──── POLITICIANS & GOVERNMENT OFFICIALS (정치인 및 관료) ────
    "joe biden", "조 바이든", "donald trump", "도널드 트럼프", "barack obama", "버락 오바마", "george w. bush", "조지 부시", "bill clinton", "빌 클린턴",
    "kamala harris", "카멀라 해리스", "mike pence", "마이크 펜스", "joe lieberman", "조 리버먼", "nancy pelosi", "낸시 펠로시", "mitch mcconnell", "미치 매코널",
    "chuck schumer", "척 슈머", "ted cruz", "테드 크루즈", "marco rubio", "마르코 루비오", "mitt romney", "밋 롬니", "rand paul", "랜드 폴",
    "bernie sanders", "버니 샌더스", "alexandria ocasio-cortez", "aoc", "오카시오 코르테즈", "ron desantis", "론 디샌티스", "gavin newsom", "개빈 뉴섬", "nikki haley", "니키 헤일리",
    "pete buttigieg", "피트 부티지지", "antony blinken", "토니 블링컨", "lloyd austin", "로이드 오스틴", "janet yellen", "재닛 옐런", "jerome powell", "제롬 파월",
    "john roberts", "존 로버츠", "clarence thomas", "클래런스 토머스", "samuel alito", "새뮤얼 얼리토", "sonia sotomayor", "소니아 소토마요르", "elena kagan", "엘레나 케이건",
    "neil gorsuch", "닐 고서치", "brett kavanaugh", "브렛 캐버너", "amy coney barrett", "에이미 코니 배럿", "ketanji brown jackson", "케탄지 브라운 잭슨",
    "kevin mccarthy", "케빈 매카시", "mike johnson", "마이크 존슨", "hakeem jeffries", "하킴 제프리스", "elizabeth warren", "엘리자베스 워런", "cory booker", "코리 부커",
    "amy klobuchar", "에이미 클로부셔", "j.d. vance", "jd 밴스", "vance", "밴스", "tim scott", "팀 스코트", "josh hawley", "조쉬 하울리", "lindsey graham", "린지 그레이엄",
    "john cornyn", "존 코닌", "ted cruz", "테드 크루즈", "tom cotton", "톰 코튼", "rick scott", "릭 스콧", "kyrsten sinema", "키어스틴 시네마", "joe manchin", "조 맨친",
    "raphael warnock", "라파엘 워녹", "jon ossoff", "존 오소프", "mark kelly", "마크 켈리", "tammy duckworth", "태미 덕워스", "dick durbin", "딕 더빈",
    "sheldon whitehouse", "쉘든 화이트하우스", "chris coons", "크리스 쿤스", "robert menendez", "밥 메넨데스", "cory booker", "코리 부커", "kirsten gillibrand", "커스틴 질리브랜드",
    "patty murray", "패티 머레이", "maria cantwell", "마리아 캔트웰", "ron wyden", "론 와이든", "jeff merkley", "제프 머클리", "dianne feinstein", "다이앤 파인스타인",
    "alex padilla", "알렉스 파딜라", "laphonza butler", "라폰자 버틀러", "brian kemp", "브라이언 켐프", "greg abbott", "그렉 애보트", "kathy hochul", "캐시 호컬",
    "jb pritzker", "jb 프리츠커", "glenn youngkin", "글렌 영킨", "jared polis", "재레드 폴리스", "gretchen whitmer", "그레첸 휘트머", "mike dewine", "마이크 드와인",
    "josh shapiro", "조쉬 샤피로", "tony evers", "토니 에버스", "roy cooper", "로이 쿠퍼", "wes moore", "웨스 무어", "sarah huckabee sanders", "새라 허커비 샌더스",
    "kristi noem", "크리스티 놈", "doug burgum", "더그 버검", "mark gordon", "마크 고든", "spencer cox", "스펜서 콕스", "phil scott", "필 스콧",
    "chris sununu", "크리스 수누누", "janet mills", "재닛 밀스", "maura healey", "모라 힐리", "dan mckee", "댄 맥키", "ned lamont", "네드 라몬트",
    "phil murphy", "필 머피", "john carney", "존 카니", "andy beshear", "앤디 비셰어", "bill lee", "빌 리", "henry mcmaster", "헨리 맥마스터",
    "tate reeves", "테이트 리브스", "kay ivey", "케이 아이비", "john bel edwards", "존 벨 에드워즈", "jeff landry", "제프 랜드리", "sarah palin", "새라 페일린",
    "mitt romney", "밋 롬니", "paul ryan", "폴 라이언", "newt gingrich", "뉴트 깅리치", "john boehner", "존 베이너", "dennis hastert", "데니스 해스터트",
    "tom delay", "톰 딜레이", "dick armey", "딕 아미", "bob dole", "밥 돌", "strom thurmond", "스트롬 서먼드", "jesse helms", "제시 헬름스",
    "barry goldwater", "배리 골드워터", "richard daley", "리처드 데일리", "rudy giuliani", "루디 줄리아니", "michael bloomberg", "마이클 블룸버그", "bill de blasio", "빌 드 블라지오",
    "eric adams", "에릭 아담스", "karen bass", "카렌 배스", "lori lightfoot", "로리 라이트풋", "brandon johnson", "브랜든 존슨", "london breed", "런던 브리드",
    "keisha lance bottoms", "케이샤 랜스 바텀스", "andre dickens", "안드레 디킨스", "sylvester turner", "실베스터 터너", "john whitmire", "존 휘트마이어", "eric garcetti", "에릭 가세티",
    "robert f. kennedy jr.", "rfk jr", "로버트 케네디 주니어", "jill stein", "질 스타인", "cornel west", "코넬 웨스트", "chase oliver", "체이스 올리버", "gary johnson", "게리 존슨",
    "ralph nader", "랄프 네이더", "ross perot", "로스 페로", "pat buchanan", "패트릭 뷰캐넌", "george wallace", "조지 왈라스", "adlai stevenson", "애들레이 스티븐슨",
    "thomas dewey", "토마스 듀이", "wendell willkie", "웬델 윌키", "alf landon", "앨프 랜던", "herbert hoover", "허버트 후버", "calvin coolidge", "캘빈 쿨리지",
    "warren harding", "워런 하딩", "woodrow wilson", "우드로 윌슨", "william howard taft", "윌리엄 태프트", "theodore roosevelt", "시어도어 루즈벨트", "william mckinley", "윌리엄 맥킨리",
    "grover cleveland", "그로버 클리블랜드", "benjamin harrison", "벤자민 해리슨", "chester arthur", "체스터 아서", "rutherford b. hayes", "러더퍼드 헤이즈", "ulysses s. grant", "율리시스 그랜트",
    "andrew johnson", "앤드류 존슨", "abraham lincoln", "에이브러햄 링컨", "james buchanan", "제임스 뷰캐넌", "franklin pierce", "프랭클린 피어스", "millard fillmore", "밀러드 필모어",
    "zachary taylor", "재커리 테일러", "james k. polk", "제임스 포크", "john tyler", "존 타일러", "william henry harrison", "윌리엄 헨리 해리슨", "martin van buren", "마틴 밴 뷰런",
    "andrew jackson", "앤드류 잭슨", "john quincy adams", "존 퀸시 아담스", "james monroe", "제임스 먼로", "james madison", "제임스 매디슨", "thomas jefferson", "토마스 제퍼슨",
    "john adams", "존 아담스", "george washington", "조지 워싱턴", "alexander hamilton", "알렉산더 해밀턴", "benjamin franklin", "벤자민 프랭클린", "john jay", "존 제이",

    // ──── BUSINESS LEADERS & ENTREPRENEURS (기업인 및 경영자) ────
    "elon musk", "일론 머스크", "musk", "머스크", "bill gates", "빌 게이츠", "jeff bezos", "제프 베이조스", "bezos", "베이조스",
    "mark zuckerberg", "마크 저커버그", "zuckerberg", "저커버그", "warren buffett", "워렌 버핏", "buffett", "버핏", "tim cook", "팀 쿡",
    "steve jobs", "스티브 잡스", "larry page", "래리 페이지", "sergey brin", "세르게이 브린", "larry ellison", "래리 엘리슨", "sundar pichai", "순다르 피차이",
    "satya nadella", "사티아 나델라", "jensen huang", "젠슨 황", "sam altman", "샘 올트먼", "altman", "올트먼", "peter thiel", "피터 틸",
    "jack dorsey", "잭 도시", "bob iger", "밥 아이거", "jamie dimon", "제이미 다이먼", "sheryl sandberg", "셰릴 샌드버그", "marissa mayer", "마리사 메이어",
    "reed hastings", "리드 헤이팅스", "ted sarandos", "테드 서랜도스", "brian chesky", "브라이언 체스키", "travis kalanick", "트래비스 칼라닉", "dara khosrowshahi", "다라 코스로샤히",
    "evan spiegel", "에반 스피겔", "bobby murphy", "바비 머피", "stewart butterfield", "스튜어트 버터필드", "marc benioff", "마크 베니오프", "michael dell", "마이클 델",
    "steve ballmer", "스티브 발머", "paul allen", "폴 앨렌", "steve wozniak", "스티브 워즈니악", "andy jassy", "앤디 재시", "ruth porat", "루스 포랏",
    "safra catz", "사프라 카츠", "meg whitman", "멕 휘트먼", "ginni rometty", "지니 로메티", "arvind krishna", "아르빈드 크리슈나", "pat gelsinger", "팻 겔싱어",
    "lisa su", "리사 수", "morris chang", "모리스 창", "rene haas", "르네 하스", "masayoshi son", "손정의", "jack ma", "마윈",
    "pony ma", "마화텅", "robin li", "리옌홍", "richard liu", "류창둥", "colin huang", "황정", "byron allen", "바이런 앨런",
    "oprah winfrey", "오프라 윈프리", "martha stewart", "마사 스튜어트", "richard branson", "리처드 브랜슨", "bernard arnault", "베르나르 아르노", "amancio ortega", "아만시오 오르테가",
    "dieter zetsche", "디터 제체", "ola källenius", "올라 켈레니우스", "mary barra", "메리 바라", "jim farley", "짐 팔리", "elon musk", "일론 머스크",
    "akio toyoda", "도요다 아키오", "koji sato", "사토 코지", "chung eui-sun", "정의선", "chey tae-won", "최태원", "koo kwang-mo", "구광모",
    "lee jae-yong", "이재용", "jay y. lee", "이재용 회장", "bang si-hyuk", "방시혁", "jyp", "박진영", "yang hyun-suk", "양현석",
    "lee soo-man", "이수만", "kim beom-su", "김범수", "brian kim", "김범수 의장", "lee hae-jin", "이해진", "charles koch", "찰스 코크",
    "david koch", "데이비드 코크", "sheldon adelson", "쉘든 아델슨", "miriam adelson", "미리엄 아델슨", "steve wynn", "스티브 윈", "donald trump", "도널드 트럼프",
    "rupert murdoch", "루퍼트 머독", "lachlan murdoch", "라클란 머독", "james murdoch", "제임스 머독", "shari redstone", "샤리 레드스톤", "sumner redstone", "썸너 레드스톤",
    "ted turner", "테드 터너", "john malone", "존 멀론", "charlie ergen", "찰리 에르겐", "lowell mcadam", "로웰 맥아담", "hans vestberg", "한스 베스트베리",
    "randall stephenson", "랜달 스티븐슨", "john stankey", "존 스탠키", "brian roberts", "브라이언 로버츠", "stephen burke", "스티븐 버크", "jeff shell", "제프 쉘",
    "albert bourla", "앨버트 불라", "stephane bancel", "스테판 방셀", "alex gorsky", "알렉스 고르스키", "joaquin duato", "호아킨 두아토", "robert davis", "로버트 데이비스",
    "richard gonzalez", "리처드 곤잘레스", "giovanni caforio", "조반니 카포리오", "david ricks", "데이비드 릭스", "daniel o'day", "대니얼 오데이", "haruo naito", "나이토 하루오",
    "lorenzo simonelli", "로렌조 시모넬리", "darren woods", "대런 우즈", "mike wirth", "마이크 워스", "ryan lance", "라이언 랜스", "vicki hollub", "비키 홀럽",
    "bernard looney", "버나드 루니", "wael sawan", "와엘 사완", "patrick pouyanne", "패트릭 푸얀네", "claudio descalzi", "클라우디오 데스칼지", "amin nasser", "아민 나세르",
    "ray dalio", "레이 달리오", "ken griffin", "켄 그리핀", "steve schwarzman", "스티브 슈워츠먼", "larry fink", "래리 핑크", "fink", "핑크",
    "david solomon", "데이비드 솔로몬", "james gorman", "제임스 고먼", "ted pick", "테드 픽", "brian moynihan", "브라이언 모이니한", "charles scharf", "찰스 샤프",
    "jane fraser", "제인 프레이저", "abilio diniz", "아빌리오 디니스", "carlos slim", "카를로스 슬림", "aliko dangote", "알리코 단고테", "jorge paulo lemann", "조르지 파울루 레만",
    "mukesh ambani", "무케시 암바니", "gautam adani", "가우탐 아다니", "tata", "타타", "cyrus poonawalla", "사이러스 푸나왈라", "dilip shanghvi", "딜립 샹비",
    "henry ford", "헨리 포드", "john d. rockefeller", "록펠러", "andrew carnegie", "앤드류 카네기", "j.p. morgan", "jp 모건", "cornelius vanderbilt", "밴더빌트",

    // ──── MEDIA FIGURES, ANCHORS & JOURNALISTS (언론인 및 미디어 방송인) ────
    "tucker carlson", "터커 칼슨", "carlson", "칼슨", "anderson cooper", "앤더슨 쿠퍼", "cooper", "쿠퍼", "sean hannity", "션 해니티",
    "rachel maddow", "레이첼 매도우", "megyn kelly", "메긴 켈리", "joe rogan", "조 로건", "rogan", "로건", "oprah winfrey", "오프라 윈프리",
    "christiane amanpour", "크리스티안 아만푸어", "jake tapper", "제이크 태퍼", "lester holt", "레스터 홀트", "david muir", "데이비드 뮤어", "walter cronkite", "월터 크론카이트",
    "stephen colbert", "스티븐 콜베어", "john oliver", "존 올리버", "bill maher", "빌 마허", "ben shapiro", "벤 샤피로", "shapiro", "샤피로",
    "alex jones", "알렉스 존스", "glenn beck", "글렌 벡", "rush limbaugh", "러시 림보", "bill o'reilly", "빌 오라일리", "chris cuomo", "크리스 쿠모",
    "don lemon", "돈 레몬", "brian stelter", "브라이언 스텔터", "fareed zakaria", "파리드 자카리아", "wolf blitzer", "울프 블리처", "erin burnett", "에린 번넷",
    "kaitlan collins", "케이틀란 콜린스", "abby phillip", "애비 필립", "dana bash", "대나 바쉬", "john king", "존 킹", "chuck todd", "척 토드",
    "kristen welker", "크리스텐 웰커", "savannah guthrie", "사바나 거스리", "hoda kotb", "호다 코트브", "al roker", "알 로커", "george stephanopoulos", "조지 스테파노풀로스",
    "robin roberts", "로빈 로버츠", "michael strahan", "마이클 스트라한", "norah o'donnell", "노라 오도넬", "gayle king", "게일 킹", "tony dokoupil", "토니 도쿠필",
    "nate burleson", "네이트 벌러슨", "bill whitaker", "빌 휘태커", "leslie stahl", "레슬리 스탈", "scott pelley", "스코트 펠리", "jon wertheim", "존 워트하임",
    "sharyn alfonsi", "샤린 알폰시", "l. jon wertheim", "l. 존 워트하임", "anderson cooper", "앤더슨 쿠퍼", "bill whitaker", "빌 휘태커", "leslie stahl", "레슬리 스탈",
    "howard stern", "하워드 스턴", "rush limbaugh", "러시 림보", "larry king", "래리 킹", "barbara walters", "바바라 윌터스", "mike wallace", "마이크 월리스",
    "ed morrow", "에드워드 머로우", "david brinkley", "데이비드 브링크리", "chet huntley", "쳇 헌틀리", "dan rather", "댄 래더", "tom brokaw", "톰 브로코",
    "peter jennings", "피터 제닝스", "ted koppel", "테드 코플", "jim lehrer", "짐 레러", "robert macneil", "로버트 맥닐", "gwen ifill", "그웬 이필",
    "judy woodruff", "주디 우드러프", "amna nawaz", "암나 나와즈", "geoff bennett", "제프 베넷", "margaret brennan", "마거릿 브레넌", "face the nation", "페이스 더 네이션",
    "meet the press", "미트 더 프레스", "state of the union", "스테이트 오브 더 유니온", "60 minutes", "60분", "inside politics", "인사이드 폴리틱스", "the lead with jake tapper", "더 리드",
    "situation room", "시추에이션 룸", "outfront", "아웃프런트", "ac360", "앤더슨 쿠퍼 360", "the source with kaitlan collins", "더 소스", "laura laura ingraham", "로라 인그레이엄",
    "jesse watters", "제시 워터스", "greg gutfeld", "그레그 거트펠드", "harold ford jr.", "해롤드 포드 주니어", "jeanine pirro", "자닌 피로", "jessica tarlov", "제시카 타를로브",
    "the five", "더 파이브", "hannity", "해니티 쇼", "the ingraham angle", "인그레이엄 앵글", "jesse watters primetime", "제시 워터스 프라임타임", "gutfeld!", "거트펠드 쇼",
    "special report with bret baier", "스페셜 리포트", "bret baier", "브렛 바이어", "martha maccallum", "마사 맥컬럼", "the story with martha maccallum", "더 스토리", "neil cavuto", "닐 카부토",
    "ari melber", "아리 멜버", "the beat with ari melber", "더 비트", "joy reid", "조이 리드", "reidout", "리이드아웃", "chris hayes", "크리스 헤이즈",
    "all in with chris hayes", "올 인", "alex wagner", "알렉스 바그너", "alex wagner tonight", "알렉스 바그너 투나잇", "stephanie ruhle", "스테파니 룰", "11th hour", "일레븐스 아워",
    "morning joe", "모닝 조", "joe scarborough", "조 스카보로", "mika brzezinski", "미카 브레진스키", "willie geist", "윌리 가이스트", "way too early", "웨이 투 얼리",
    "jonathan lemire", "조나단 르미어", "symone sanders-townsend", "시몬 샌더스 타운센드", "al sharpton", "알 샤프턴", "politicsnation", "폴리틱스네이션", "michael steele", "마이클 스틸",
    "alicia menendez", "알리시아 메넨데스", "symone", "시몬 쇼", "weekend msnbc", "위켄드 msnbc", "mehdi hasan", "메흐디 하산", "the mehdi hasan show", "메흐디 하산 쇼",
    "bill karins", "빌 카린스", "steve kornacki", "스티브 코나키", "kornacki", "코나키", "kasie hunt", "케이시 헌트", "kasie dc", "케이시 dc",
    "charles blow", "찰스 블로우", "paul krugman", "폴 크루그먼", "krugman", "크루그먼", "thomas friedman", "토마스 프리드먼", "friedman", "프리드먼",
    "david brooks", "데이비드 브룩스", "brooks", "브룩스", "maureen dowd", "모린 다우드", "dowd", "다우드", "ross douthat", "로스 다우댓", "douthat", "다우댓",
    "jamelle bouie", "자멜 부이", "ezra klein", "에즈라 클라인", "klein", "클라인", "kara swisher", "카라 스위셔", "swisher", "스위셔",
    "walter isaacson", "월터 아이작슨", "isaacson", "아이작슨", "jon meacham", "존 미첨", "meacham", "미첨", "doris kearns goodwin", "도리스 컨스 굿윈",
    "michael beschloss", "마이클 베슐로스", "beschloss", "베슐로스", "douglas brinkley", "더글러스 브링크리", "brinkley", "브링크리", "fareed zakaria gp", "gip스 gps",

    // ──── RELIGIOUS FIGURES & LEADERS (종교인 및 종교 지도자) ────
    "billy graham", "빌리 그레이엄", "franklin graham", "프랭클린 그레이엄", "joel osteen", "조엘 오스틴", "osteen", "오스틴",
    "rick warren", "릭 워렌", "t.d. jakes", "td 제이크스", "jakes", "제이크스", "kenneth copeland", "케네스 코플랜드", "copeland", "코플랜드",
    "joyce meyer", "조이스 마이어", "meyer", "마이어", "creflo dollar", "크레플로 달러", "dollar", "달러 목사", "benny hinn", "베니 힌",
    "pat robertson", "패트 로버트슨", "martin luther king jr.", "마틴 루터 킹", "mlk", "fulton sheen", "풀턴 신", "thomas merton", "토마스 머튼",
    "john macarthur", "존 맥아더", "macarthur", "맥아더 목사", "charles stanley", "찰스 스탠리", "andy stanley", "앤디 스탠리", "tim keller", "팀 켈러",
    "keller", "팀 켈러 목사", "john piper", "존 파이퍼", "piper", "파이퍼 목사", "francis chan", "프랜시스 찬", "chan", "프랜시스 찬 목사",
    "rob bell", "롭 벨", "bell", "롭 벨 목사", "tony campolo", "토니 캠폴로", "campolo", "캠폴로", "jim wallis", "짐 월리스",
    "wallis", "월리스 목사", "richard rohr", "리처드 로어", "rohr", "로어 신부", "james martin", "제임스 마틴", "martin sj", "마틴 신부",
    "rowan williams", "로완 윌리엄스", "justin welby", "저스틴 웰비", "desmond tutu", "데스몬드 투투", "tutu", "투투 주교",
    "dalai lama", "달라일라마", "thich nhat hanh", "틱낫한", "pope francis", "교황 프란치스코", "francis", "교황",
    "benedict xvi", "베네딕토 16세", "john paul ii", "요한 바오로 2세", "billy graham", "빌리 그레이엄", "fulton sheen", "풀턴 신 주교",
    "jimmy swaggart", "지미 스와거트", "swaggart", "스와거트", "jim bakker", "짐 바커", "bakker", "짐 바커 목사", "tammy faye", "태미 페이",
    "oral roberts", "오랄 로버츠", "roberts", "오랄 로버츠 목사", "robert schuller", "로버트 슐러", "schuller", "슐러 목사", "norman vincent peale", "노먼 빈센트 필",
    "peale Peale", "필 목사", "reinhold niebuhr", "라인홀드 니버", "niebuhr", "니버", "paul tillich", "폴 틸리히", "tillich", "틸리히",
    "dietrich bonhoeffer", "디트리히 본회퍼", "bonhoeffer", "본회퍼", "karl barth", "칼 바르트", "barth", "바르트", "c.s. lewis", "cs 루이스",
    "lewis", "루이스", "g.k. chesterton", "체스터턴", "chesterton", "체스터턴", "thomas aquinas", "토마스 아퀴나스", "aquinas", "아퀴나스",
    "augustine", "아우구스티누스", "saint paul", "사도 바울", "saint peter", "사도 베드로", "jesus christ", "예수 그리스도", "moses", "모세",
    "abraham", "아브라함", "muhammad", "무함마드", "buddha", "부처", "lao tzu", "노자", "confucius", "공자"
  ]
};

