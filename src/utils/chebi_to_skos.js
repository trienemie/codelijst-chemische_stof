import jp from 'jsonpath';
import jsonld from 'jsonld' ;
import {readFileSync} from 'fs';
import fs from 'fs-extra';
import { QueryEngine } from "@comunica/query-sparql";
import rdfDataset from "@rdfjs/dataset";
import {jsonld_writer, n3_reasoning, output} from 'maven-metadata-generator-npm';
import {
    chebi_jsonld,
    chebi_ttl,
    config,
    frame_chebi,
    context_extra
} from './variables.js';
import Environment from '@zazuko/env/Environment.js'
import baseEnv from '@zazuko/env'
import { FsUtilsFactory } from '@zazuko/rdf-utils-fs'
import formats from '@rdfjs/formats'
import { inchikeys_from_csv } from './inchikeys.js'

//const context = JSON.parse(readFileSync('./utils/context.json'));
// create an environment by adding FsUtilsFactory
const env = new Environment([FsUtilsFactory], { parent: baseEnv })
// add parsers+serializers
env.formats.import(formats)



async function write_json(json, filepath) {
    try {
        await fs.writeFile(filepath, JSON.stringify(json, null, 4))
        console.log('success!')
    } catch (err) {
        console.error(err)
    }
}

async function get_chebi_from_inchikey(inchikeys){
    var new_json = new Array();
    const endpoint = "https://sparql.rhea-db.org/sparql";
    for (const inchikey of inchikeys) {
        const json_file = './source/chebi/entities/' + inchikey + '.json'
        if (fs.existsSync(json_file)) {
            new_json.push( jp.query(await jsonld.flatten(JSON.parse(readFileSync(json_file)), frame_chebi), '$.graph[*]'));
        }
        else {
            try {
                const myEngine = new QueryEngine();
                var query =
                    'PREFIX skos:  <http://www.w3.org/2004/02/skos/core#> ' +
                    'prefix chebi:  <http://purl.obolibrary.org/obo/chebi/> ' +
                    'prefix geneontology: <http://www.geneontology.org/formats/oboInOwl#> ' +
                    'prefix rdfs:   <http://www.w3.org/2000/01/rdf-schema#> ' +
                    'prefix obo:   <http://purl.obolibrary.org/obo/> ' +
                    'prefix dbo:   <http://dbpedia.org/ontology/>' +
                    'prefix dbp:   <http://dbpedia.org/property/>' +
                    'prefix owl:   <http://www.w3.org/2002/07/owl#>' +
                    'construct {\n' +
                    '  ?stof a skos:Concept  ;         \n' +
                    '    skos:note         ?note ;        \n' +
                    '    chebi:charge             ?charge;       \n' +
                    '    dbo:formula           ?formula;        \n' +
                    '    dbo:inchi              ?inchi;       \n' +
                    '    dbp:inchikey           ?inchikey;        \n' +
                    '    dbo:smiles             ?smiles;              \n' +
                    '    skos:altLabel             ?hasSynonym;        \n' +
                    '    skos:exactMatch        ?chebi_id  ;        \n' +
                    '    skos:semanticRelation  ?subclass  .} \n' +
                    'where { \n' +
                    '  ?chebi_id chebi:inchikey "' + inchikey + '" ;   \n' +
                    '                                                            \n' +
                    '                                                         chebi:charge             ?charge;         \n' +
                    '                                                         chebi:formula            ?formula;         \n' +
                    '                                                         chebi:inchi              ?inchi;         \n' +
                    '                                                         chebi:inchikey           ?inchikey;         \n' +
                    '                                                         chebi:smiles             ?smiles;       \n' +
                    '                                                         geneontology:hasSynonym ?hasSyn . \n' +
                    '  optional {?chebi_id         rdfs:subClassOf        ?subclass .  \n' +
                    '    ?subclass ?p2 ?o2 .\n' +
                    '    ?subclass a owl:Class .}\n' +
                    '  optional { ?chebi_id   obo:IAO_0000115         ?IAO_0000115 }\n' +
                    '    bind(iri(concat("https://data.omgeving.vlaanderen.be/id/concept/chemische_stof/",  "' + inchikey + '")) as ?stof)\n' +
                    ' BIND(STRLANG(?hasSyn, "en") AS ?hasSynonym)' +
                    ' BIND(STRLANG(?IAO_0000115, "en") AS ?note)' +
                    ' }';

                const dataset = rdfDataset.dataset()
                const quadStream = await myEngine.queryQuads(query, { sources: ['https://sparql.rhea-db.org/sparql'] });
                quadStream.on('data', (quad) => {
                    dataset.add(quad);
                });
                quadStream.on('end', () => {
                    jsonld_writer(dataset, [json_file, frame_chebi]);
                });
            }
            catch(err) {
                write_json({"inchikey": inchikey, "error": err}, './source/chebi/entities/error/' + inchikey + '.json');
                console.error(err);
            }
        }
    }
    return {"@graph": new_json, "@context": context_extra}
}


async function chebi_information() {
    const inchikeys = await inchikeys_from_csv()
    const my_jsonld = await get_chebi_from_inchikey(inchikeys)
    //fs.writeFileSync('/home/gehau/git/codelijst-chemische_stof/src/main/resources/be/vlaanderen/omgeving/data/id/conceptscheme/chemische_stof/chemische_stof_chebi_taxonomy-test.jsonld'
    //     , JSON.stringify(await jsonld.frame(my_jsonld, frame_chebi), null, 4));
    // //write_json(jsonld, './source/chemont/entities/error/' + inchikey + '.json');
    const nt = await n3_reasoning(my_jsonld, config.skos.rules)
    output('/home/gehau/git/codelijst-chemische_stof/src/main/resources/be/vlaanderen/data/ns/chemische_stof_shapes/shacl.ttl', nt, chebi_ttl, chebi_jsonld)
    console.log("parent information");
}

export { chebi_information }


