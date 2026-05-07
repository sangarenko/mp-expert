#!/usr/bin/env python3
"""
V3: Aggressive cleaning of marketplace AI training data.
Focus: remove all course selling, event announcements, plugin promos, engagement bait.
Keep only substantive marketplace data with metrics, cases, strategies.
"""

import re

def should_remove(post):
    """Determine if a post should be entirely removed."""
    text = post.strip()
    if not text or len(text) < 30:
        return True
    
    t = text.lower()
    
    # === COURSE SELLING (Rule 4) ===
    # Posts that are primarily course/intensive selling
    if re.search(r"let`s rock on wb.*поток|let.*s rock on wb.*\d|интенсив по продвижению на wb.*старт", t):
        return True
    if re.search(r"стартует.*интенсив по продвижению|запускаю.*поток.*интенсив|основные продажи и приём заявок на.*поток интенсива", t):
        return True
    if re.search(r"курс по системному продвижению на wildberries|курс по.*продвижению.*старт.*марта", t):
        return True
    if re.search(r"стоимость.*990\s*₽|990\s*₽ за 3 дня|купить билет.*990", t):
        # But only if the post is primarily course selling
        course_indicators = sum(1 for p in [r'программ\w+ практикум', r'спикер\w+:', r'билет', r'запис\w+ через бот', r'участие.*платное'] if re.search(p, t))
        if course_indicators >= 2:
            return True
    
    # === EVENT ANNOUNCEMENTS (Rule 1) ===
    if re.search(r"митап.*марта|конференци\w+ по заработку на маркетплейс", t):
        return True
    if re.search(r"всероссийски\w+ слет селлер\w+|слет селлер\w+.*казан", t):
        return True
    if re.search(r"приходите на мастер-класс|регистрируйтесь по ссылке|стартует интенсив|занять место.*митап", t):
        return True
    
    # === HOLIDAY GREETINGS (Rule 6) ===
    if re.search(r"с 8 марта|с наступающим.*годом|с новым годом|🌸.*девушки.*wildberries|дорогие.*невероятные.*восхитительные девушки", t):
        return True
    if re.search(r"поздравля.*с новы.*годом|женщины на вб.*неслабый пол|8 марта.*богини маркетплейс|с праздником вас.*девушки", t):
        return True
    
    # === ENGAGEMENT BAIT / POLLS (Rule 6) ===
    if re.search(r"нас уже.*в канале.*селлер|нас.*думающих селлеров|пушка бомба|70 000.*селлер|80 000 думающих|60 000.*селлер", t):
        return True
    if re.search(r"розыгрыш|выиграй|сделайте мем|призы.*подписка", t):
        return True
    if re.search(r"голосуем.*товарке.*одежде|кто с какого числа начинает работать", t):
        return True
    
    # === GIVEAWAYS (Rule 5) ===
    if re.search(r"промокод.*wbc|скидка.*30.*подключени.*только сегодня", t):
        return True
    if re.search(r"мини-юбилей.*розыгрыш|розыгрыш.*подписк.*закрытый", t):
        return True
    
    # === PLUGIN PROMOTIONS (Rule 3) ===
    # EVIRMA PRO selling
    if re.search(r"evirma pro.*запуск|вечн\w+ pro-лицензия|подключить pro.*выберите", t):
        return True
    if re.search(r"снизили тарифы evirma pro|новые тарифы.*персональный.*помесячно.*1099", t):
        return True
    if re.search(r"evirma pro надо подключать всем|корпоративный тариф.*подключать.*обязательно проконтролируйте", t):
        return True
    # Джем subscription promo codes
    if re.search(r"промокод.*wbc", t) and len(text) < 300:
        return True
    
    # === JOB POSTINGS ===
    if re.search(r"ищу к себе в команду|ваканси.*маркетплейс|как попасть ко мне в команду|маркетплейс-маркетолог.*руководител", t):
        return True
    
    # === SCAMMER WARNINGS ===
    if re.search(r"мошенники.*приглашения.*закрытый клуб|аватарка.*название аккаунта ставят.*как у меня", t):
        return True
    
    # === NON-WB CASES (Nike UGC) ===
    if re.search(r"кейс успешной ugc-кампании nike|just do it.*ugc-стратег", t):
        return True
    
    # === HUMOR WITHOUT DATA ===
    if re.search(r"хомяк.*комбат.*тапать|аналог humster combat|ловили лимитов на поставки.*могут же когда захотят", t):
        return True
    
    # === AUTHOR BIOS ===
    if re.search(r"пост знакомство.*нас с вами в канале|это я.*2003 год.*первый it-стартап|в it с 2003 года", t):
        if not has_metrics(t):
            return True
    if re.search(r"за время прошлого поста обо мне.*пришли.*новых участников", t):
        return True
    
    # === CLOSED CHANNEL PROMOS ===
    if re.search(r"закрытом клубе запускаем новую рубрику|хотел бы.*рассказать.*что у нас происходит в моем закрытом канале", t):
        if not has_metrics(t):
            return True
    if re.search(r"мастермайнды и нетворкинг-встречи|нетворкинг.*региональные офф-лайн|1 раз спросить у опытного селлера.*закрытом канале", t):
        return True
    
    # === AI TOOL PROMOS ===
    if re.search(r"klingai обновился.*а/в-тесты.*новом уровне|нейросеть klingai выпустила мощное обновление", t):
        if not has_metrics(t):
            return True
    
    # === VIDEO ANNOUNCEMENTS ===
    if re.search(r"смотреть только со звуком.*про все эти последние нововведения", t):
        return True
    
    # === LINK-ONLY ===
    if len(text) < 150 and re.search(r"ссылка на таблицу|вот здесь показывал|читайте здесь", t):
        return True
    
    # === VERY SHORT WITHOUT DATA ===
    if len(t) < 100 and not has_metrics(t):
        return True
    
    # === COMMUNITY RECRUITMENT ===
    if re.search(r"собираю сообщество топ экспертов.*бесплатное.*платное.*вклад каждого", t):
        return True
    
    # === ADDITIONAL REMOVALS ===
    # Course review/testimonial posts
    if re.search(r"отзывами о прошлом потоке интенсива|поделиться отзывами о прошлом потоке", t):
        return True
    if re.search(r"иногда может показаться.*они прям написаны искусственно.*публикую все как есть", t):
        return True
    
    # Course announcement + testimonial
    if re.search(r"я вот опубликовал анонс своего интенсива|просто по-человечески интересно.*отзывом", t):
        return True
    
    # "Why this isn't just about ads" - course promo
    if re.search(r"ошибочное мнение об интенсиве|почему у меня нет курса по настройке рекламы", t):
        return True
    
    # Closed club "card breakdown" promo
    if re.search(r"закрытом клубе запускаем новую рубрику.*разбор топ-карточек", t):
        return True
    if re.search(r"все детали по клубу и тарифы здесь|залетай в закрытый", t):
        return True
    
    # Speaking event announcements
    if re.search(r"выступаю в крокусе|промо.*бесплатный вход.*с праздником вас", t):
        return True
    
    # More course selling posts
    if re.search(r"онлайн-интенсив.*как с нуля заработать до 10 млн рублей|стартует.*онлайн-интенсив.*заработать.*маркетплейс", t):
        return True
    if re.search(r"поделиться парой отзывов с последнего потока.*важная часть моей работы", t):
        return True
    if re.search(r"не быть голословным.*хочу поделиться парой отзывов", t):
        return True
    # "Вышка умерла" - general educational advice, not marketplace data
    if re.search(r"вышка умерла.*учитесь сами", t):
        return True
    
    return False

def has_metrics(text):
    """Check if text contains marketplace metrics."""
    patterns = [
        r'\d+\.?\d*%', r'\d+\s*₽', r'\d+\s*(млн|млрд|трлн)',
        r'(ддр|ctr|cro|crf|cpc|cpm|cpo|cps|спп|ltv|romi|roi)',
        r'конверси\w+', r'маржинальност', r'комисси\w+',
        r'логистик\w*\s*\d+', r'наценк\w+',
    ]
    return any(re.search(p, text) for p in patterns)

def extract_questions_from_promo(post):
    """Extract useful questions from promotional posts."""
    text = post
    questions = []
    
    q_patterns = [
        (r'почему CTR главного фото растет, а конверсия в корзину остается прежней', 
         'Почему CTR главного фото растет, а конверсия в корзину остается прежней?'),
        (r'какие элементы инфографики реально влияют на добавление в корзину',
         'Какие элементы инфографики реально влияют на добавление в корзину?'),
        (r'как перестать сливать 30 000 ₽ в месяц на ключи, которые дают показы, но не дают заказов',
         'Как перестать сливать 30 000 ₽/мес на ключи, которые дают показы, но не заказы?'),
        (r'как за 10 минут найти УТП, которое выделит вас в выдаче среди 200 одинаковых карточек',
         'Как за 10 минут найти УТП, которое выделит в выдаче среди 200 одинаковых карточек?'),
        (r'как понять, какой ключ принёс заказ, а какой просто съел бюджет',
         'Как понять, какой ключ принёс заказ, а какой просто съел бюджет?'),
        (r'сколько должен стоить один заказ с рекламы, чтобы экономика сходилась',
         'Сколько должен стоить один заказ с рекламы, чтобы экономика сходилась?'),
        (r'почему карточки с «хорошим дизайном» часто не продают',
         'Почему карточки с «хорошим дизайном» часто не продают?'),
        (r'как доносить УТП так, чтобы его понимал покупатель',
         'Как доносить УТП так, чтобы его понимал покупатель?'),
    ]
    
    for pattern, formatted in q_patterns:
        if re.search(pattern, text, re.IGNORECASE):
            questions.append(formatted)
    
    return questions

def strip_promo_sections(post):
    """Remove promotional sections from otherwise substantive posts."""
    lines = post.split('\n')
    cleaned = []
    
    for line in lines:
        ll = line.lower().strip()
        
        # Skip lines that are pure promotion
        promo_line_patterns = [
            r'@maxprowb_bot', r'@evirmav', r'forms\.gle/',
            r'запись через бота', r'купить билет.*990',
            r'стоимость.*990\s*₽.*за 3 дня практикума',
            r'занимать места\s*👇',
            r'перейдите на сайт практикума',
            r'подробнее о всем практикуме на 3 дня',
            r'подробности по программе и регистрация',
            r'записаться на интенсив можно здесь',
            r'подробнее тут\s*$', r'вступить в закрытый канал\s*$',
            r'бот закрытого канала\s*$',
            r'если интересно.*прокачать.*интенсив.*записаться',
            r'приглашаю вас на интенсив',
            r'участие условно-платное.*стоимость.*990',
            r'даже если у вас нет оплаченной pro-подписки.*14 дней бесплатно',
            r'q&a со мной.*прямом эфире',
            r'если не получается быть в эти даты.*у вас останутся записи',
            r'онлайн.*в zoom.*подключиться можно откуда угодно',
            r'за 3 дня вы получите реально много пользы',
            r'он у вас и правда лишние что ли',
            r'всех обнял.*всем продаж.*🤝.*у вас и правда лишние',
            r'они у вас и правда лишние что ли\)',
            r'будем собирать рабочую модель.*записаться можно здесь',
            r'нативочка.*на интенсиве',
            r'как настроить процесс.*разбираем на интенсиве.*детально',
            r'оффтоп.*разбираем на интенсиве',
            r'на интенсиве.*как раз разбираем.*как делать лучше рынка',
            r'подробности.*интенсив.*бот',
            r'записи эфиров.*бонусы в виде доп уроков',
            r'👉 подробнее о всем практикуме',
            r'👉 купить билет на 3 дня за 990',
            r'👉 принять участие.*переходите на сайт',
            r'если хотите.*карточка.*реально конвертила.*приходите',
            r'если хотите.*прокачать компетенции.*присоединяйтесь',
            r'суть кейса не в том.*записаться на интенсив можно здесь',
            r'в общем.*всем компетенций.*всем продаж',
            r'спикер.*лидия кудина', r'спикер.*ольга максимова',
            r'🎁 бонус 25 апреля.*таблица.*анализ контентной воронки',
            r'программа практикум.*1-ый день.*сильный контент',
            r'2-й день.*настройка и оптимизация.*evirma',
            r'3-й день.*разборы рекламных кампаний.*карточек участников',
            r'на интенсиве.*разбираем.*подробнее|на интенсиве.*таблица.*оцифровк',
            r'на интенсиве.*обязательно ведутся оба|на интенсиве.*максимально детально',
            r'разбираем на интенсиве.*потому что тема требует',
            r'на интенсиве.*большой блок и таблица',
            r'с интенсива.*обязательно ведутся оба показател',
            r'на скрине наша таблица оцифровки.*с интенсива',
            r'на уроке по.*на интенсиве было много вопросов',
            r'для более точной аналитики на интенсиве мы используем',
            r'если интересно.*жду всех на интенсиве.*там будет разбираться',
            r'очень детально мы их разбираем на интенсиве',
            r'как мы делаем на интенсиве.*продающее видео',
            r'у нас на интенсиве условно это 120 пунктов',
            r'кейс ученика с интенсива.*подходит как иллюстрация',
            r'период работ на интенсиве с поддержкой кураторов',
            r'после интенсивa.*участники меняют товар.*нишу',
            r'об этом отдельно говорим много на интенсиве',
            r'это разбираем на интенсиве, но не отвлекаемся',
        ]
        
        is_promo_line = False
        for p in promo_line_patterns:
            if re.search(p, ll):
                is_promo_line = True
                break
        
        if not is_promo_line:
            cleaned.append(line)
    
    result = '\n'.join(cleaned).strip()
    result = re.sub(r'\n{3,}', '\n\n', result)
    return result

def determine_date_tag(post):
    """Determine date relevance tag."""
    t = post.lower()
    
    # Recent data indicators (likely Sep 2025+)
    recent_indicators = [
        r'индекс остатков.*сентябр|с 2 сентября.*индекс остатков',
        r'привлекательн\w+ цен\w+.*вместо.*поддержка продаж',
        r'оплата за клики.*всех кабинетах|cpc на wb.*всех кабинетах',
        r'поддержка продаж.*усиление.*beta',
        r'повышение логистики.*40%.*сентябр|15 сентября.*логистик',
        r'аукцион.*всех страниц.*июл|с 9 июля.*минимальные ставки',
        r'тарифные опции.*7 или 14 дней',
        r'ресейл.*б/у товары.*wildberries',
        r'кешбэк.*селлеры будут сами устанавливать',
        r'отчет.*воронка продаж.*увидели карточку',
        r'аукционе.*рекомендательных полках.*отдельную ставку',
        r'новый рейтинг.*отдельно для каждого артикула',
        r'спп.*падени.*подготовк.*черн.*пятниц',
        r'шифрование данных.*не будет|учли вашу обратную связь.*перенести.*шифрование',
        r'подмена артикулов.*сервис создания виртуальных',
        r'wb инфлюенс.*продвижение товаров через блогеров',
        r'индекс остатков.*скорректировал|с 8 сентября.*изменим подход',
    ]
    for p in recent_indicators:
        if re.search(p, t):
            return '[АКТУАЛЬНЫЕ ДАННЫЕ]'
    
    # Older data indicators (before Sep 2025)
    older_indicators = [
        r'в прошлом году|2024 год|2023 год',
        r'раньше было.*стало.*маржинальност',
        r'доллар.*105|юань.*14,55',
        r'было 25%.*стало ~20%.*на следующий год.*15-17%',
    ]
    for p in older_indicators:
        if re.search(p, t):
            return '[СТРАТЕГИЧЕСКИЙ КОНТЕКСТ]'
    
    return ''

def process_file(input_path, output_path):
    """Main processing function."""
    with open(input_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Split into posts by double newlines
    raw_posts = re.split(r'\n{2,}', content)
    
    kept_posts = []
    extracted_questions = []
    removed_count = 0
    kept_count = 0
    
    for post in raw_posts:
        post = post.strip()
        if not post or len(post) < 30:
            removed_count += 1
            continue
        
        if should_remove(post):
            questions = extract_questions_from_promo(post)
            extracted_questions.extend(questions)
            removed_count += 1
            continue
        
        # Strip promotional sections
        cleaned = strip_promo_sections(post)
        
        # If after stripping too little remains, check for questions
        if len(cleaned.strip()) < 50:
            questions = extract_questions_from_promo(post)
            extracted_questions.extend(questions)
            removed_count += 1
            continue
        
        # Add date tag
        date_tag = determine_date_tag(post)
        
        kept_posts.append((date_tag, cleaned))
        kept_count += 1
    
    # Build output
    header = """=====================================
AI TRAINING DATASET — МАРКЕТПЛЕЙСЫ (WB/OZON)
Очистка от рекламы, анонсов, мусора
Только содержательные данные: метрики, кейсы, стратегии, аналитика
====================================="""
    
    output_parts = [header, '']
    
    # Collect tags
    актуальные = []
    стратегические = []
    нетеги = []
    
    for tag, post in kept_posts:
        if tag == '[АКТУАЛЬНЫЕ ДАННЫЕ]':
            актуальные.append(post)
        elif tag == '[СТРАТЕГИЧЕСКИЙ КОНТЕКСТ]':
            стратегические.append(post)
        else:
            нетеги.append(post)
    
    if актуальные:
        output_parts.append('[АКТУАЛЬНЫЕ ДАННЫЕ]')
        output_parts.append('')
        for p in актуальные:
            output_parts.append(p)
            output_parts.append('')
    
    if стратегические:
        output_parts.append('[СТРАТЕГИЧЕСКИЙ КОНТЕКСТ]')
        output_parts.append('')
        for p in стратегические:
            output_parts.append(p)
            output_parts.append('')
    
    if нетеги:
        for p in нетеги:
            output_parts.append(p)
            output_parts.append('')
    
    # Add extracted questions section
    if extracted_questions:
        output_parts.append('[ПОЛЕЗНЫЕ ВОПРОСЫ/ПРОБЛЕМЫ ИЗ РЕКЛАМНОГО ПОСТА]')
        seen = set()
        for q in extracted_questions:
            if q not in seen:
                output_parts.append(f'- {q}')
                seen.add(q)
        output_parts.append('')
    
    output = '\n'.join(output_parts)
    
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(output)
    
    return kept_count, removed_count, len(extracted_questions)

if __name__ == '__main__':
    input_path = '/home/z/my-project/marketplace_ai_training_data.txt'
    output_path = '/home/z/my-project/marketplace_ai_training_data_clean.txt'
    
    kept, removed, questions = process_file(input_path, output_path)
    
    with open(output_path, 'r', encoding='utf-8') as f:
        out_content = f.read()
    
    out_lines = out_content.count('\n') + 1
    out_bytes = len(out_content.encode('utf-8'))
    
    print(f'Kept: {kept} posts')
    print(f'Removed: {removed} posts')
    print(f'Extracted questions: {questions}')
    print(f'Output: {out_lines} lines, {out_bytes:,} bytes')
    print(f'Input: 2388 lines, 2,526,483 bytes')
    print(f'Reduction: {(1 - out_bytes/2526483)*100:.1f}%')
