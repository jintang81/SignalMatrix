"""
顶部放量筛选器 — Top Volume Surge Screener（潜在见顶出货信号）

筛选条件：
  1. 股价 ≥ MA50（50日均线），处于上升趋势
  2. 年初至今收益为正（YTD return > 0）
  3. 今日成交量 ≥ 20日均量 × 2x（顶部放量信号）

股票池：S&P500 + NASDAQ-100 + Russell 2000 代表性成分股（约 3000 只）
数据源：Yahoo Finance v8 Chart API，经 Cloudflare Worker 代理
"""

import datetime
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests
from urllib.parse import quote

try:
    from zoneinfo import ZoneInfo
except ImportError:
    from backports.zoneinfo import ZoneInfo

# ─── Core params ──────────────────────────────────────────────────
LOOKBACK_DAYS     = 200
MIN_MARKET_CAP    = 300e6
VOLUME_MULTIPLIER = 2.0
MA50_PERIOD       = 50
VOL_MA_PERIOD     = 20
CHART_LEN         = 60
MAX_WORKERS       = 12

# ─── Stock universe ───────────────────────────────────────────────

ETF_LIST = [
    "SPY","QQQ","IWM","DIA","VOO","VTI","IVV","VEA","VWO","EFA",
    "XLK","XLF","XLE","XLV","XLI","XLY","XLP","XLU","XLB","XLRE","XLC",
    "ARKK","ARKW","ARKF","SMH","SOXX","IGV","CIBR",
    "TLT","HYG","LQD","GLD","SLV","USO","UNG",
    "TQQQ","SOXL","UPRO","TECL","VTWO","SPSM","IJR","VBR","VBK","COPX",
]

_NASDAQ_EXTRA = [
    "AFRM","BILL","CFLT","COIN","CRDO","DOCS","DUOL","ENVX","ESTC","FOUR",
    "GDRX","GLBE","GTLB","HIMS","HUBS","IOT","IONQ","JAMF","JOBY","KVYO",
    "LMND","LYFT","MARA","MELI","MNDY","NCNO","NTNX","SNOW","SOUN","SQ",
    "TDOC","TOST","TTD","TWLO","U","UPST","VRNS","WDAY","WIX","ZETA","ZS",
    "ACAD","ALNY","ARVN","ARWR","BEAM","BNTX","BPMC","CRSP","DKNG","DVAX",
    "EDIT","EXAS","GILD","INCY","IONS","MRNA","NVCR","REGN","RXRX","VRTX",
]

_RUSSELL2000 = [
    "ACLS","ACMR","AEHR","AEIS","AEVA","AFIB","AGEN","AGYS","AHCO","AIMD",
    "AINV","AIRC","ALCO","ALDX","ALEX","ALGT","ALGS","ALLO","ALLT","ALOK",
    "ALPA","ALRM","ALSA","ALTI","ALTO","ALTU","ALTV","ALXO","AMAG","AMBC",
    "AMBO","AMCX","AMEH","AMIX","AMKR","AMMO","AMNB","AMRB","AMRN","AMRX",
    "AMSC","AMST","AMTB","AMTD","AMTI","AMTX","AMWD","AMWL","AMYT",
    "APOG","AQST","ARDX","ARQT","ASND","ATAI","ATEC","ATNM","AUPH","AVDL",
    "AVTE","AXSM","AZTA","BBIO","BCYC","BHVN","BNGO","BPTH","BTAI","CAPR",
    "CBAY","CCCC","CCRN","CDNA","CEMI","CGEM","CHPT","CMRX","CNMD","COHU",
    "CORT","CPRX","CRBP","CRBU","CRIS","CSII","CTMX","CVAC","CYRX","DARE",
    "DCGO","DCPH","DCTH","DGII","DMAC","DNLI","DNUT","DRIO","DRRX","DTIL",
    "DYAI","EARS","EDIT","EFSC","ELAN","ELME","EMKR","ENSG","ENVA","ENVB",
    "EOLS","EPRT","EQBK","ERAS","ESAB","ESNT","ETWO","EVBG","EVGO","EVLV",
    "EVOP","EVRI","EXEL","EXLS","EXPI","EZPW","FCEL","FCPT","FIGS","FIVN",
    "FIZZ","FLGT","FLNC","FLO","FOLD","FONR","FORM","FORR","FOSL","FOUR",
    "FROG","FRPT","FSCO","FSLY","FTCI","FTDR","FUNC","GALT","GBIO","GCMG",
    "GCTS","GDYN","GERN","GFAI","GLBE","GLDD","GLNG","GLPG","GNLX","GNPX",
    "GNTA","GOEV","GOSS","GOVX","GPMT","GPRE","GRBK","GREE","GRNA","GRTS",
    "GTHX","GTLB","GTLS","GWRS","HALO","HAYW","HCAT","HCSG","HLIT","HLTH",
    "HMST","HNNA","HNRG","HOFT","HOLX","HOMB","HOPE","HRMY","HROW","HSKA",
    "HTBK","HTGC","HTGM","HTLD","HUDI","HUMA","HURC","HURN","IBTX","ICAD",
    "ICHR","ICON","ICPT","ICUI","IDCC","IDEX","IDYA","IGMS","IINN","IKNA",
    "ILPT","IMCR","IMKTA","IMMP","IMTX","INAB","INBK","INDB","INFN","INFU",
    "INGN","INMB","INMD","INNV","INSP","INSW","INTG","INUV","INVA","IONQ",
    "IONS","IOVA","IRBT","IRMD","IRTC","IRWD","ISDR","ISEE","ISPC","ISRG",
    "ITGR","ITRI","ITRM","ITRN","IVAC","JAKK","JANX","JBLU","JILL","JNCE",
    "JOBY","JOUT","JSPR","JYNT","KALA","KALI","KARO","KFRC","KLDI","KLIC",
    "KLXE","KMDA","KNBE","KNDI","KNSA","KNSL","KORE","KPLT","KPRX","KPTI",
    "KRMD","KROS","KRYS","KTOS","KVHI","LADR","LASE","LASR","LBRDA","LCID",
    "LECO","LEGH","LENZ","LESL","LFMD","LGND","LGVN","LHCG","LIFE","LILI",
    "LKFN","LLNW","LMAT","LMND","LNDC","LNST","LNTH","LOAR","LOAN","LOCO",
    "LOGI","LOMA","LOOP","LOPE","LPSN","LQDA","LRHC","LRMR","LTBR","LTHM",
    "LWAY","LYFT","LYTS","MACK","MAIA","MAIN","MARA","MARK","MASI","MATW",
    "MAXN","MBCN","MBIN","MBLY","MBUU","MCBC","MCBS","MCFT","MCRI","MCRB",
    "MDAI","MDGL","MDNA","MDSP","MDWD","MEIP","MELI","MERC","MESO",
    "METC","MGAM","MGEE","MGNI","MGPI","MHLD","MIDD","MITK","MKSI","MLAB",
    "MLKN","MLNK","MMAC","MMAT","MNDO","MNKD","MNRO","MNSO","MNTX","MODG",
    "MOFG","MORF","MORN","MOTS","MPLN","MPTI","MPWR","MRCC","MRCY","MRIN",
    "MRNA","MRSN","MRTN","MRUS","MSBI","MSEX","MTCH","MTLS","MTRN","MTRX",
    "MTTR","MULN","MVBF","MVIS","MYFW","MYGN","MYMD","MYRG","NABL","NARI",
    "NATH","NATR","NBTB","NBTX","NCMI","NCNO","NDLS","NDSN","NEGG","NERV",
    "NETI","NEXT","NKLA","NKTR","NKTX","NMCO","NMFC","NMIH","NMRA","NMRK",
    "NNBR","NNOX","NOTV","NOVA","NOVT","NPCE","NRBO","NRIM","NRIX","NSIT",
    "NTBL","NTCT","NTLA","NTST","NUAN","NUVL","NVCR","NVEI","NVET","NVGS",
    "NVOS","NVST","NWPX","NXGL","NXRT","NXTX","NYMT","OBNK","OCGN","OCUL",
    "OCUP","ODFL","OFIX","OFLX","OKLO","OKTA","OLAB","OLBK","OLED","OMEG",
    "OMER","OMEX","ONDS","ONEW","ONFO","ONGN","ONIT","ONON","ONTO","OPAD",
    "OPBK","OPEN","OPFI","OPRX","ORBC","ORGO","ORLA","ORMP","ORMS","OSBC",
    "OSIS","OSMT","OSPN","OSTX","OSUR","OTLK","OTTR","OUST","OVID","OWLT",
    "OXLC","PAHC","PALI","PALT","PAMC","PAYS","PAYO","PBHC","PBNC","PBTS",
    "PCBC","PCEL","PCSA","PCVX","PDFS","PDSB","PEGA","PENN","PFBC","PFHD",
    "PFIS","PFLT","PFMT","PFSI","PGNY","PHAT","PHIO","PHLT","PHMR","PHVS",
    "PIAI","PICC","PIPR","PIRS","PJET","PKBK","PKOH","PLAB","PLBC","PLCE",
    "PLMR","PLNT","PLPC","PLRX","PLSE","PLTX","PLUG","PLUR","PLUS","PLXS",
    "PMTS","PNFP","PNNT","POOL","POWI","POWR","PPBI","PPBT","PPSI","PRCT",
    "PRFT","PRGE","PRGO","PRGS","PRIM","PRLB","PRMW","PRPL","PRSO","PRTA",
    "PRTC","PRTK","PRTX","PRVB","PRVL","PSEC","PSFE","PSMG","PSMT","PSNL",
    "PSQH","PSTI","PSTV","PTCT","PTGX","PTHL","PTHR","PTIX","PTLO","PTNR",
    "PTSI","PTVE","PUBM","PULM","PUMP","PVBK","PWFL","PWOD","PXLW","PXMD",
    "PYPL","PZZA","QBTS","QCRH","QDEL","QFIN","QGEN","QIPT","QNST","QRTEA",
    "QTWO","QUBT","QUIK","QURE","RADI","RAND","RBOT","RCKT","RCKY","RCMT",
    "RDNT","RDVT","REAX","RECN","REED","RELY","REPH","RETA","RETO","REVG",
    "REXR","RFIL","RGNX","RGLD","RGLS","RGTI","RIOT","RLAY","RLGT","RLMD",
    "RMBS","RMNI","RNST","ROAD","ROIV","ROKR","ROLL","ROSE","RSKD","RTRX",
    "RVMD","RVNC","RVPH","RXRX","SAFE","SAGE","SAIA","SANA","SANM","SASI",
    "SATL","SBCF","SBCP","SBGI","SBOW","SBTX","SCCO","SCHL","SDGR","SDIG",
    "SELB","SERI","SFBS","SFNC","SFST","SGMO","SGMT","SGRY","SHBI","SHCO",
    "SHLS","SILK","SILO","SIOX","SITM","SKYW","SLDB","SLGD","SLNA","SLNG",
    "SMBC","SMBK","SMCI","SMED","SMMT","SMPL","SMRT","SNBR","SNCE","SNCY",
    "SNCR","SNEX","SNOA","SNPO","SNPX","SNSS","SOHO","SOHU","SOLI","SOLO",
    "SONN","SONO","SOUN","SPCE","SPFI","SPIR","SPOK","SPRC","SPRO","SPRX",
    "SPRY","SPSC","SPTN","SQFT","SQNS","SQSP","SRDX","SRGA","SRPT","SRTS",
    "SSRM","SSSS","SSYS","STAA","STAR","STBA","STCN","STFC","STIM","STIX",
    "STKS","STOK","STRN","STRO","STRS","STRT","STSS","STVN","SUMO","SUNS",
    "SURF","SWBI","SWKH","SWIM","SYBT","SYNH","SYNX","SYRS","TACT","TALO",
    "TALS","TANH","TARA","TARS","TAST","TBLT","TBNK","TBPH","TCBK","TCEL",
    "TCFC","TCMD","TDUP","TELA","TENB","TERN","TFII","TGLS","TGTX","THAR",
    "THFF","THMO","THRY","THTX","TIGO","TIGR","TLIS","TLRY","TMDX","TMHC",
    "TNON","TPIC","TPVG","TRAK","TRCB","TRIN","TRIP","TRMK","TRNS","TRST",
    "TRTX","TRUE","TRVI","TRVN","TSHA","TSIA","TSVT","TTCF","TTEC","TTEK",
    "TTGT","TTMI","TUBE","TUES","TUFN","TUSK","TVTX","TWST","TWNK","TXMD",
    "TXRH","TYHT","UCBI","UDMY","UEPS","UFPT","UHAL","UONE","UPST","USAK",
    "USAU","USEA","USEG","USLM","USNA","UTHR","UTMD","UUUU","UVSP","VALN",
    "VALU","VBIV","VBLT","VBTX","VCSA","VECO","VERA","VERB","VERI","VERO",
    "VERU","VERV","VETS","VIAV","VIRC","VISL","VIVE","VIVK","VLDR","VLTO",
    "VNRX","VNTG","VORB","VRDN","VREX","VRGX","VRME","VRNA","VRNT","VRRM",
    "VRSK","VRTA","VRTS","VRTU","VRTX","VSAT","VSTM","VSTO","VTMX","VTOL",
    "VTRS","VTVT","VXRT","WAVS","WBEV","WDAY","WFCF","WGBS","WKHS","WLDN",
    "WLFC","WNEB","WNST","WOLF","WSBC","WSFS","WSTG","WTBA","WTFC","WTRG",
    "WULF","XCUR","XELA","XENE","XENI","XERS","XFOR","XNCR","XOMA","XPEL",
    "XPER","XPEV","XPOF","XRAY","XREG","XTIA","YELL","YMAB","YMTX","YNFO",
    "ZDGE","ZEAL","ZENV","ZEUS","ZFOX","ZLAB","ZLCS","ZNTL","ZUMZ","ZVRA",
    "ZYME","ZYXI",
]

_FALLBACK_SP500 = [
    "MMM","AOS","ABT","ABBV","ACN","ADBE","AMD","AES","AFL","A","APD","ABNB","AKAM","ALB","ARE",
    "ALGN","ALLE","LNT","ALL","GOOGL","GOOG","MO","AMZN","AMCR","AEE","AAL","AEP","AXP","AIG",
    "AMT","AWK","AMP","AME","AMGN","APH","ADI","ANSS","AON","APA","AAPL","AMAT","APTV","ACGL",
    "ADM","ANET","AJG","AIZ","T","ATO","ADSK","ADP","AZO","AVB","AVY","AXON","BKR","BALL","BAC",
    "BK","BBWI","BAX","BDX","WRB","BBY","BIIB","BLK","BX","BA","BSX","BMY","AVGO","BR","BRO",
    "BG","BLDR","CHRW","CDNS","CPT","CPB","COF","CAH","KMX","CCL","CARR","CAT","CBOE","CBRE",
    "CDW","COR","CNC","CDAY","CF","SCHW","CHTR","CVX","CMG","CB","CHD","CI","CINF","CTAS","CSCO",
    "C","CFG","CLX","CME","CMS","KO","CTSH","CL","CMCSA","CAG","COP","ED","STZ","CEG","COO",
    "CPRT","GLW","CTVA","CSGP","COST","CTRA","CCI","CSX","CMI","CVS","DHR","DRI","DVA","DE",
    "DAL","DVN","DXCM","FANG","DLR","DFS","DG","DLTR","D","DPZ","DOV","DOW","DHI","DTE","DUK",
    "DD","EMN","ETN","EBAY","ECL","EIX","EW","EA","ELV","LLY","EMR","ENPH","ETR","EOG","EQT",
    "EFX","EQIX","EQR","ESS","EL","ETSY","ES","EXC","EXPE","EXPD","EXR","XOM","FDS","FICO",
    "FAST","FRT","FDX","FIS","FITB","FSLR","FE","FI","FLT","FMC","F","FTNT","FTV","FOXA","FOX",
    "BEN","FCX","GRMN","IT","GE","GEHC","GEV","GNRC","GD","GIS","GM","GPC","GILD","GPN","GS",
    "HAL","HIG","HAS","HCA","HSIC","HSY","HES","HPE","HLT","HOLX","HD","HON","HRL","HST","HWM",
    "HPQ","HUBB","HUM","HBAN","HII","IBM","IEX","IDXX","ITW","INCY","IR","PODD","INTC","ICE",
    "IFF","IP","IPG","INTU","ISRG","IVZ","INVH","IQV","IRM","JKHY","J","JBL","JPM","K","KDP",
    "KEY","KEYS","KMB","KIM","KMI","KLAC","KHC","KR","LHX","LH","LRCX","LW","LVS","LDOS","LEN",
    "LIN","LYV","LKQ","LMT","L","LOW","LULU","LYB","MTB","MRO","MPC","MKTX","MAR","MMC","MLM",
    "MAS","MA","MKC","MCD","MCK","MDT","MRK","META","MET","MTD","MGM","MCHP","MU","MSFT","MAA",
    "MRNA","MOH","TAP","MDLZ","MPWR","MNST","MCO","MS","MOS","MSI","MSCI","NDAQ","NTAP","NFLX",
    "NEM","NWSA","NWS","NEE","NKE","NI","NDSN","NSC","NTRS","NOC","NCLH","NRG","NUE","NVDA",
    "NVR","NXPI","ORLY","OXY","ODFL","OMC","ON","OKE","ORCL","OTIS","PCAR","PKG","PLTR","PH",
    "PAYX","PAYC","PYPL","PNR","PEP","PFE","PCG","PM","PSX","PNC","POOL","PPG","PPL","PFG","PG",
    "PGR","PLD","PRU","PEG","PTC","PSA","PHM","PWR","QCOM","DGX","RL","RJF","RTX","O","REG",
    "REGN","RF","RSG","RMD","RVTY","ROK","ROL","ROP","ROST","RCL","SPGI","CRM","SBAC","SLB",
    "STX","SRE","NOW","SHW","SPG","SJM","SW","SNA","SO","SWK","SBUX","STT","STLD","STE","SYK",
    "SMCI","SYF","SNPS","SYY","TMUS","TROW","TTWO","TPR","TRGP","TGT","TEL","TDY","TFX","TER",
    "TSLA","TXN","TPL","TXT","TMO","TJX","TSCO","TT","TDG","TRV","TRMB","TFC","TYL","TSN","USB",
    "UBER","UDR","UNP","UAL","UPS","URI","UNH","VLO","VTR","VRSN","VRSK","VZ","VRTX","VTRS",
    "VICI","V","VST","VMC","WAB","WMT","DIS","WBD","WM","WAT","WEC","WFC","WELL","WST","WDC",
    "WY","WHR","WMB","WTW","GWW","WYNN","XEL","XYL","YUM","ZBRA","ZBH","ZTS",
    "DECK","GEV","KVUE","SOLV","VLTO","CEG","VST","GDDY","EG","AXON","ERIE",
    "HUBB","LDOS","LW","MKL","PODD","PWR","TRMB","TTD","CRWD","PANW","SNOW",
]

_FALLBACK_NDX = [
    "ADSK","ANSS","BKNG","CDNS","DDOG","DXCM","EBAY","ENPH","EQIX","FAST",
    "FTNT","GEHC","GRMN","IDXX","ILMN","INCY","LRCX","LULU","MCHP","MDLZ",
    "MNST","MRNA","MSCI","NFLX","NXPI","ODFL","ORLY","PAYX","PCAR","PYPL",
    "REGN","ROST","SIRI","TEAM","TTD","VRSK","VRTX","WDAY","ZS","CRWD",
    "ABNB","COIN","RBLX","DKNG","ROKU","SHOP","NET","MDB","PANW","GTLB",
]


def _fetch_sp500_wiki():
    import urllib.request, html.parser as _hp

    class TableParser(_hp.HTMLParser):
        def __init__(self):
            super().__init__()
            self.in_first_table = False
            self.row = []; self.rows = []
            self.col_idx = None; self.header_done = False
            self.td_text = ''; self.in_td = False; self.table_count = 0

        def handle_starttag(self, tag, attrs):
            attrs = dict(attrs)
            if tag == 'table' and 'wikitable' in attrs.get('class', ''):
                self.table_count += 1
                if self.table_count == 1:
                    self.in_first_table = True
            if self.in_first_table and tag in ('td', 'th'):
                self.in_td = True; self.td_text = ''

        def handle_endtag(self, tag):
            if tag == 'table' and self.in_first_table:
                self.in_first_table = False
            if self.in_first_table and tag in ('td', 'th'):
                self.in_td = False; self.row.append(self.td_text.strip())
            if self.in_first_table and tag == 'tr':
                if not self.header_done:
                    for i, h in enumerate(self.row):
                        if 'Symbol' in h or 'Ticker' in h:
                            self.col_idx = i
                    self.header_done = True
                else:
                    if self.col_idx is not None and len(self.row) > self.col_idx:
                        self.rows.append(self.row[self.col_idx])
                self.row = []

        def handle_data(self, data):
            if self.in_td:
                self.td_text += data

    import urllib.request
    url = 'https://en.wikipedia.org/wiki/List_of_S%26P_500_companies'
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=15) as resp:
        html_content = resp.read().decode('utf-8')
    parser = TableParser()
    parser.feed(html_content)
    tickers = [t.replace('.', '-') for t in parser.rows if t and t != 'Symbol']
    if len(tickers) < 400:
        raise ValueError(f"Only got {len(tickers)} tickers")
    return tickers


def get_stock_universe():
    sp500 = []
    ndx   = []
    try:
        sp500 = _fetch_sp500_wiki()
        print(f"[INFO] Live S&P500: {len(sp500)}")
    except Exception as e:
        print(f"[WARN] S&P500 fetch failed ({e}), using fallback")
        sp500 = _FALLBACK_SP500
    ndx = _FALLBACK_NDX  # use fallback for NASDAQ-100 (fast enough)

    all_raw = sp500 + ndx + _NASDAQ_EXTRA + _RUSSELL2000 + ETF_LIST
    all_tickers = sorted(set(
        t.replace(".", "-") for t in all_raw
        if t and 1 <= len(t.replace(".", "-")) <= 6
        and t.replace(".", "-").replace("-", "").isalpha()
    ))
    print(f"[INFO] Universe total: {len(all_tickers)}")
    return all_tickers


# ─── Data fetching ────────────────────────────────────────────────

import time
CF_PROXY_BASE = "https://yahoo-proxy.hejintang.workers.dev/"
YAHOO_BASE    = "https://query1.finance.yahoo.com"

_session = requests.Session()
_session.headers.update({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json",
})


def _proxy_url(path):
    return CF_PROXY_BASE + "?url=" + quote(YAHOO_BASE + path, safe="")


def fetch_ohlcv(ticker, days=LOOKBACK_DAYS):
    end   = int(time.time())
    start = end - days * 86400
    path  = f"/v8/finance/chart/{ticker}?interval=1d&period1={start}&period2={end}&events=history"
    r     = _session.get(_proxy_url(path), timeout=20)
    r.raise_for_status()
    data  = r.json()

    res   = data["chart"]["result"][0]
    meta  = res["meta"]
    q     = res["indicators"]["quote"][0]
    ts    = res.get("timestamp", [])
    ac    = res.get("indicators", {}).get("adjclose", [{}])[0].get("adjclose", [])

    closes  = ac if ac else q.get("close", [])
    opens   = q.get("open", [])
    highs   = q.get("high", [])
    lows    = q.get("low", [])
    volumes = q.get("volume", [])

    # deduplicate last bar
    if len(ts) >= 2:
        def to_day(t):
            d = datetime.datetime.utcfromtimestamp(t)
            return (d.year, d.month, d.day)
        if to_day(ts[-1]) == to_day(ts[-2]):
            ts = ts[:-1]; closes = closes[:-1]; opens = opens[:-1]
            highs = highs[:-1]; lows = lows[:-1]; volumes = volumes[:-1]

    rows = []
    for i in range(len(closes)):
        if all(x is not None for x in [closes[i], opens[i], highs[i], lows[i], volumes[i]]):
            rows.append({
                "date":   datetime.datetime.utcfromtimestamp(ts[i]).strftime("%Y-%m-%d"),
                "open":   opens[i], "high": highs[i], "low": lows[i],
                "close":  closes[i], "volume": volumes[i],
            })

    market_cap = meta.get("marketCap", 0) or 0
    if market_cap == 0:
        try:
            qr = _session.get(_proxy_url(f"/v7/finance/quote?symbols={ticker}&fields=marketCap,totalAssets"), timeout=10)
            qdata = qr.json().get("quoteResponse", {}).get("result", [])
            if qdata:
                market_cap = qdata[0].get("marketCap", 0) or qdata[0].get("totalAssets", 0) or 0
        except Exception:
            pass

    return rows, market_cap


# ─── Screening logic ──────────────────────────────────────────────

def screen_ticker(ticker):
    try:
        rows, market_cap = fetch_ohlcv(ticker, LOOKBACK_DAYS)
    except Exception:
        return None

    if market_cap < MIN_MARKET_CAP:
        return None
    if len(rows) < MA50_PERIOD + 5:
        return None

    closes  = [r["close"]  for r in rows]
    volumes = [r["volume"] for r in rows]

    # Condition 1: price >= MA50 (uptrend)
    ma50 = sum(closes[-MA50_PERIOD:]) / MA50_PERIOD
    last_close = closes[-1]
    if last_close < ma50:
        return None

    # Condition 2: YTD return > 0
    current_year = datetime.datetime.utcnow().year
    year_start_price = None
    for r in rows:
        if r["date"].startswith(str(current_year)):
            year_start_price = r["close"]
            break
    if year_start_price is None or year_start_price <= 0:
        return None
    ytd_return = (last_close - year_start_price) / year_start_price
    if ytd_return <= 0:
        return None

    # Condition 3: today's volume >= 20-day avg × VOLUME_MULTIPLIER
    if len(volumes) < VOL_MA_PERIOD + 1:
        return None
    vol_ma = sum(volumes[-(VOL_MA_PERIOD + 1):-1]) / VOL_MA_PERIOD
    if vol_ma <= 0:
        return None
    last_vol  = volumes[-1]
    prev_vol  = volumes[-2]
    vol_ratio  = last_vol / vol_ma
    vol_ratio2 = prev_vol / vol_ma
    if vol_ratio < VOLUME_MULTIPLIER:
        return None

    # Build chart data (most recent CHART_LEN bars)
    chart_rows    = rows[-CHART_LEN:]
    chart_closes  = [r["close"]  for r in chart_rows]
    chart_opens   = [r["open"]   for r in chart_rows]
    chart_highs   = [r["high"]   for r in chart_rows]
    chart_lows    = [r["low"]    for r in chart_rows]
    chart_volumes = [r["volume"] for r in chart_rows]
    chart_dates   = [r["date"]   for r in chart_rows]

    # MA50 series for chart window
    ma50_series = []
    for i in range(len(rows) - CHART_LEN, len(rows)):
        if i >= MA50_PERIOD - 1:
            ma50_series.append(sum(closes[i - MA50_PERIOD + 1:i + 1]) / MA50_PERIOD)
        else:
            ma50_series.append(None)

    # Vol MA series for chart window
    vol_ma_series = []
    for i in range(len(rows) - CHART_LEN, len(rows)):
        if i >= VOL_MA_PERIOD - 1:
            vol_ma_series.append(sum(volumes[i - VOL_MA_PERIOD + 1:i + 1]) / VOL_MA_PERIOD)
        else:
            vol_ma_series.append(None)

    return {
        "ticker":     ticker,
        "last_close": round(last_close, 2),
        "ma50":       round(ma50, 2),
        "ytd_return": round(ytd_return * 100, 2),
        "last_vol":   last_vol,
        "prev_vol":   prev_vol,
        "vol_ma30":   round(vol_ma, 0),  # field name matches HTML template convention
        "vol_ratio":  round(vol_ratio, 2),
        "vol_ratio2": round(vol_ratio2, 2),
        "market_cap": market_cap,
        "chart": {
            "dates":    chart_dates,
            "open":     chart_opens,
            "high":     chart_highs,
            "low":      chart_lows,
            "close":    chart_closes,
            "volume":   chart_volumes,
            "ma50":     ma50_series,
            "vol_ma30": vol_ma_series,
        },
    }


# ─── Entry point ──────────────────────────────────────────────────

def run_top_volume_scan() -> dict:
    """Scan all tickers and return structured result dict (stored in Redis)."""
    tickers = get_stock_universe()
    results = []
    lock    = threading.Lock()
    total   = len(tickers)
    done    = [0]

    def worker(t):
        res = screen_ticker(t)
        with lock:
            done[0] += 1
            if res:
                results.append(res)
                print(f"  ✓ {t:6s} | close={res['last_close']:.2f} "
                      f"MA50={res['ma50']:.2f} YTD=+{res['ytd_return']:.1f}% "
                      f"vol={res['vol_ratio']:.1f}x")
            if done[0] % 100 == 0:
                print(f"  progress {done[0]}/{total}, found {len(results)}")

    print(f"[top_volume] scanning {total} tickers with {MAX_WORKERS} threads…")
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as exe:
        futures = {exe.submit(worker, t): t for t in tickers}
        for _ in as_completed(futures):
            pass

    results.sort(key=lambda x: x["vol_ratio"], reverse=True)

    now_la  = datetime.datetime.now(ZoneInfo("America/Los_Angeles"))
    tz_abbr = now_la.strftime("%Z")

    print(f"[top_volume] scan done: {len(results)} stocks passed")
    return {
        "date":      now_la.strftime("%Y-%m-%d"),
        "scan_time": now_la.strftime(f"%Y-%m-%d %H:%M:%S {tz_abbr}"),
        "results":   results,
        "params": {
            "volume_multiplier": VOLUME_MULTIPLIER,
            "ma50_period":       MA50_PERIOD,
            "vol_ma_period":     VOL_MA_PERIOD,
            "min_market_cap_b":  MIN_MARKET_CAP / 1e9,
        },
    }


if __name__ == "__main__":
    result = run_top_volume_scan()
    print(f"\nFound {len(result['results'])} stocks at {result['scan_time']}")
