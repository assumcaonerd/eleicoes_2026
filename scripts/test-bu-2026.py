import json, urllib.request, asn1tools, os

SPEC="/tmp/tse2026/spec/bu.asn1"
BASE="https://resultados.tse.jus.br/oficial/ele2026/arquivo-urna/3220"
UF="es"; MUN="56006"; ZONE="0046"; SEC="0059"

conv=asn1tools.compile_files(SPEC,codec="ber")
aux_url=f"{BASE}/dados/{UF}/{MUN}/{ZONE}/{SEC}/p003220-{UF}-m{MUN}-z{ZONE}-s{SEC}-aux.json"
with urllib.request.urlopen(aux_url,timeout=30) as r: aux=json.load(r)
h=aux["hashes"][0]
bu=next(x for x in h["arq"] if x.get("tp")=="bu")
bu_url=f"{BASE}/dados/{UF}/{MUN}/{ZONE}/{SEC}/{h['hash']}/{bu['nm']}"
with urllib.request.urlopen(bu_url,timeout=30) as r: raw=r.read()
env=conv.decode("EntidadeEnvelopeGenerico",raw)
decoded=conv.decode("EntidadeBoletimUrna",env["conteudo"])
print("SECTION="+json.dumps(decoded.get("identificacaoSecao"),ensure_ascii=False,default=str))
print("DADOS="+json.dumps(decoded.get("dadosSecaoSA"),ensure_ascii=False,default=str))
found=[]; sample_votes=[]
for eleicao in decoded.get("resultadosVotacaoPorEleicao",[]):
    for resultado in eleicao.get("resultadosVotacao",[]):
        for total in resultado.get("totaisVotosCargo",[]):
            cargo=total.get("codigoCargo")
            for voto in total.get("votosVotaveis",[]):
                ident=voto.get("identificacaoVotavel") or {}
                sample_votes.append({"cargo":cargo,"tipo":voto.get("tipoVoto"),"ident":ident,"q":voto.get("quantidadeVotos")})
                numero=ident.get("codigo")
                if numero is None: numero=ident.get("numeroVotavel")
                if str(numero)=="22190": found.append({"cargo":cargo,"voto":voto})
print("FOUND="+json.dumps(found,ensure_ascii=False,default=str))
print("SAMPLE="+json.dumps(sample_votes[:30],ensure_ascii=False,default=str))
