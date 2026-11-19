import os
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle


def build_pdf(output_path: str) -> None:
    doc = SimpleDocTemplate(
        output_path,
        pagesize=A4,
        leftMargin=1.7 * cm,
        rightMargin=1.7 * cm,
        topMargin=1.25 * cm,
        bottomMargin=1.25 * cm,
    )

    styles = getSampleStyleSheet()
    navy = colors.HexColor('#0f172a')
    accent = colors.HexColor('#0369a1')
    light_bg = colors.HexColor('#f1f5f9')
    border = colors.HexColor('#cbd5e1')
    text_dark = colors.HexColor('#1e293b')

    title_style = ParagraphStyle(
        'TitleCustom',
        parent=styles['Title'],
        fontName='Helvetica-Bold',
        fontSize=17,
        leading=22,
        textColor=navy,
        spaceAfter=4,
        alignment=0,
    )
    subtitle_style = ParagraphStyle(
        'SubtitleCustom',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9.5,
        leading=13,
        textColor=accent,
        spaceAfter=10,
    )
    h2_style = ParagraphStyle(
        'H2Custom',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=11,
        leading=15,
        textColor=navy,
        spaceBefore=7,
        spaceAfter=3.5,
    )
    body_style = ParagraphStyle(
        'BodyCustom',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9.2,
        leading=13.2,
        textColor=text_dark,
        spaceAfter=4.5,
    )
    bullet_style = ParagraphStyle(
        'BulletCustom',
        parent=body_style,
        leftIndent=14,
        bulletIndent=4,
        spaceAfter=3,
    )
    cell_style = ParagraphStyle(
        'CellCustom',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=12,
        textColor=text_dark,
    )
    cell_bold_style = ParagraphStyle(
        'CellBoldCustom',
        parent=cell_style,
        fontName='Helvetica-Bold',
        textColor=navy,
    )
    header_cell_style = ParagraphStyle(
        'HeaderCellCustom',
        parent=cell_style,
        fontName='Helvetica-Bold',
        textColor=colors.white,
    )

    story = []

    story.append(Paragraph('Relatório de Governança e Qualidade dos Dados', title_style))
    story.append(Paragraph(
        'Sistema EstoqueRevisao • Proposta Implementada: Painel de Qualidade dos Dados (Data Quality Monitor)',
        subtitle_style,
    ))
    story.append(HRFlowable(width='100%', thickness=1.2, color=accent, spaceAfter=10))

    meta_table = Table(
        [
            [
                Paragraph('Projeto:', cell_bold_style),
                Paragraph('EstoqueRevisao (Gestão de Estoque e Revisão)', cell_style),
                Paragraph('Branch:', cell_bold_style),
                Paragraph('develop (Ambiente de Teste)', cell_style),
            ],
            [
                Paragraph('Funcionalidade:', cell_bold_style),
                Paragraph('Painel de Governança e Qualidade dos Dados', cell_style),
                Paragraph('Data:', cell_bold_style),
                Paragraph('19/11/2026', cell_style),
            ],
        ],
        colWidths=[3.1 * cm, 7.3 * cm, 1.8 * cm, 5.4 * cm],
    )
    meta_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), light_bg),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BOX', (0, 0), (-1, -1), 0.6, border),
        ('INNERGRID', (0, 0), (-1, -1), 0.4, border),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 10))

    story.append(Paragraph('1. Visão Geral da Proposta', h2_style))
    story.append(Paragraph(
        'Foi proposto e implementado o <b>Painel de Governança e Qualidade dos Dados</b>, uma ferramenta analítica integrada '
        'ao menu administrativo do sistema EstoqueRevisao. Seu propósito é realizar auditorias automatizadas sobre os dados '
        'operacionais (produtos, lotes, posições de estoque e remessas), traduzindo a saúde da base de dados em um '
        '<b>Índice de Qualidade dos Dados (0% a 100%)</b> e em alertas acionáveis.',
        body_style,
    ))

    story.append(Paragraph('2. Funcionamento e Dimensões Avaliadas', h2_style))
    story.append(Paragraph(
        'O motor de auditoria no backend (<b>DataQualityService</b>) consulta os registros ativos no PostgreSQL e avalia '
        'quatro dimensões fundamentais de qualidade dos dados:',
        body_style,
    ))

    raw_rows = [
        ['Dimensão', 'Regra Verificada', 'Severidade', 'Impacto na Governança'],
        ['Completude Cadastral', 'Produtos ativos sem peso unitário ou sem validade padrão', 'Média / Baixa', 'Garante cálculos logísticos e controle de validade'],
        ['Validade de Lotes', 'Lotes vencidos ou a vencer (<= 30 dias) com saldo em estoque', 'Alta / Média', 'Previne expedição de material impróprio (FEFO)'],
        ['Consistência de Saldos', 'Posições de estoque com quantidade negativa', 'Alta', 'Protege a integridade física e contábil'],
        ['Tempestividade', 'Separações expiradas ou remessas pendentes há mais de 72h', 'Alta / Baixa', 'Evita gargalos operacionais entre setores'],
    ]

    dim_data = []
    for idx, row in enumerate(raw_rows):
        style_to_use = header_cell_style if idx == 0 else cell_style
        dim_data.append([
            Paragraph(row[0], header_cell_style if idx == 0 else cell_bold_style),
            Paragraph(row[1], style_to_use),
            Paragraph(row[2], style_to_use),
            Paragraph(row[3], style_to_use),
        ])

    dim_table = Table(dim_data, colWidths=[3.4 * cm, 6.2 * cm, 2.4 * cm, 5.4 * cm], repeatRows=1)
    dim_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), navy),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, light_bg]),
        ('GRID', (0, 0), (-1, -1), 0.5, border),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(dim_table)
    story.append(Spacer(1, 8))

    story.append(Paragraph('3. Qual Problema a Funcionalidade Resolve', h2_style))
    story.append(Paragraph(
        'Antes desta implementação, inconsistências silenciosas — como produtos cadastrados sem peso ou validade padrão, '
        'lotes expirados parados em posições de estoque ou remessas travadas em separação além do prazo — não possuíam '
        'visibilidade centralizada. Isso gerava risco de divergência em relatórios do PCP e falhas no fluxo entre Revisão, '
        'Produção e Expedição. O painel centraliza a detecção dessas falhas e orienta o usuário com recomendações práticas.',
        body_style,
    ))

    story.append(Paragraph('4. Contribuição para Governança e Qualidade dos Dados', h2_style))
    for item in [
        '<b>Monitoramento por Métricas e Indicadores:</b> Calcula o Índice Geral de Qualidade (%) e notas individuais por dimensão, classificando o sistema em <i>Saudável</i>, <i>Atenção</i> ou <i>Crítico</i>.',
        '<b>Validação Contínua e Saneamento:</b> Lista todas as não conformidades com filtros por dimensão, severidade e código, além de exportação em CSV para planos de ação.',
        '<b>Controle de Acesso:</b> Endpoint <i>GET /api/v1/data-quality/report</i> e rota de interface protegidos pelo <i>AdminGuard</i> (restritos ao perfil Administrador).',
        '<b>Rastreabilidade (Observabilidade):</b> Cada execução da auditoria registra automaticamente um evento estruturado no módulo <i>SystemLogsService</i>.',
    ]:
        story.append(Paragraph(f'• {item}', bullet_style))

    story.append(Paragraph('5. Implementação Técnica e Validação Automatizada', h2_style))
    story.append(Paragraph(
        'A funcionalidade foi implementada no backend NestJS (módulo <i>data-quality</i> registrado no <i>AppModule</i>) '
        'e no frontend React (<i>DataQualityPage.tsx</i> integrada ao menu de Administração). Todos os testes unitários '
        'criados — <b>data-quality.service.spec.ts</b> (3 cenários no backend) e <b>DataQualityPage.spec.tsx</b> (renderização '
        'e indicadores no frontend) — bem como os builds de backend e frontend foram validados com 100% de aprovação antes do envio para a branch <b>develop</b>.',
        body_style,
    ))

    doc.build(story)


if __name__ == '__main__':
    base_dir = os.path.dirname(os.path.abspath(__file__))
    out_pdf = os.path.join(base_dir, 'Relatorio_Governanca_Qualidade_Dados.pdf')
    build_pdf(out_pdf)
    print(f'PDF gerado: {out_pdf}')
