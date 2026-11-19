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
        leftMargin=1.8 * cm,
        rightMargin=1.8 * cm,
        topMargin=1.6 * cm,
        bottomMargin=1.6 * cm,
    )

    styles = getSampleStyleSheet()
    navy = colors.HexColor('#0f172a')
    accent = colors.HexColor('#0369a1')
    muted = colors.HexColor('#475569')
    light_bg = colors.HexColor('#f1f5f9')
    border = colors.HexColor('#cbd5e1')

    title_style = ParagraphStyle('TitleCustom', parent=styles['Title'], fontSize=17, textColor=navy, spaceAfter=4, alignment=0)
    subtitle_style = ParagraphStyle('SubtitleCustom', parent=styles['Normal'], fontSize=10, textColor=accent, spaceAfter=10, fontName='Helvetica-Bold')
    h2_style = ParagraphStyle('H2Custom', parent=styles['Heading2'], fontSize=12, textColor=navy, spaceBefore=10, spaceAfter=5)
    body_style = ParagraphStyle('BodyCustom', parent=styles['Normal'], fontSize=9.5, leading=13.5, textColor=colors.HexColor('#1e293b'), spaceAfter=5)
    bullet_style = ParagraphStyle('BulletCustom', parent=body_style, leftIndent=12, bulletIndent=4, spaceAfter=3.5)

    story = []

    story.append(Paragraph('Relatório de Governança e Qualidade dos Dados', title_style))
    story.append(Paragraph('Sistema EstoqueRevisao • Proposta Implementada: Painel de Qualidade dos Dados (Data Quality Monitor)', subtitle_style))
    story.append(HRFlowable(width='100%', thickness=1.2, color=accent, spaceAfter=8))

    meta_table = Table(
        [
            ['Projeto:', 'EstoqueRevisao (Gestão de Estoque e Revisão)', 'Branch:', 'develop (Ambiente de Teste)'],
            ['Funcionalidade:', 'Painel de Governança e Qualidade dos Dados', 'Data:', '19/11/2026'],
        ],
        colWidths=[2.8 * cm, 7.2 * cm, 2.0 * cm, 5.4 * cm],
    )
    meta_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), light_bg),
        ('TEXTCOLOR', (0, 0), (-1, -1), navy),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (2, 0), (2, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 8.5),
        ('BOX', (0, 0), (-1, -1), 0.6, border),
        ('INNERGRID', (0, 0), (-1, -1), 0.4, border),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 8))

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

    dim_data = [
        ['Dimensão', 'Regra Verificada', 'Severidade', 'Impacto'],
        ['Completude Cadastral', 'Produtos ativos sem peso unitário ou sem validade padrão', 'Média / Baixa', 'Garante cálculos logísticos e controle de validade'],
        ['Validade de Lotes', 'Lotes vencidos ou a vencer (<= 30 dias) com saldo em estoque', 'Alta / Média', 'Previne expedição de material impróprio (FEFO)'],
        ['Consistência de Saldos', 'Posições de estoque com quantidade negativa', 'Alta', 'Protege a integridade física e contábil'],
        ['Tempestividade', 'Separações expiradas ou remessas pendentes > 72h', 'Alta / Baixa', 'Evita gargalos operacionais entre setores'],
    ]
    dim_table = Table(dim_data, colWidths=[3.5 * cm, 6.2 * cm, 2.5 * cm, 5.2 * cm])
    dim_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), navy),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 8.2),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, light_bg]),
        ('GRID', (0, 0), (-1, -1), 0.5, border),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    story.append(dim_table)
    story.append(Spacer(1, 6))

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
