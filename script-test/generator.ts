import { TezosToolkit } from '@taquito/taquito';
import { InMemorySigner } from '@taquito/signer';
import { localForger, getCodec, CODEC } from '@taquito/local-forging';
import axios from 'axios';

const mainnet_url = 'https://mainnet.api.tez.ie';
const hangzhounet_url = 'https://hangzhounet.api.tez.ie';

const testScriptEnv = {
    privateKey: '',
    branch: 'BKiXcfN1ZTXnNNbTWSRArSWzVFc6om7radWq5mTqGX6rY4P2Uhe',
    tz1Address: 'tz1YU2zoyCkXPKEA4jknSpCpMs7yUndVNe3S',
    tz2Address: 'tz2FwBnXhuXvPAUcr1aF3uX84Z6JELxrdYxD',
    tz3Address: 'tz3WxgnteyTpM5YzJSTFFtnNYB8Du31gf3bW',
    KT1Address: 'KT19etCHSt75MTF4NvUHxRNBPvp74ggv9g3P',
    baker: "tz1aWXP237BLwNHJcCD4b3DutCevhqq2T1Z9",
    fee: "1300",
    counter: "3325582",
    gas_limit: "10100",
    storage_limit: "300",
    amount: "3500000"    
}

const getCounter = async (address: string, nodeUrl: string, ) => {
    if(nodeUrl == 'https://hangzhounet.api.tez.ie') {
      const url = 'https://api.hangzhou2net.tzkt.io/v1/accounts/' + address + '/counter';
      axios.get(url)
      .then((response)=>{
        return (parseInt(response.data)+1).toString();
      });
    } else {
      const url = 'https://api.mainnet.tzkt.io/v1/accounts/' + address + '/counter';
      axios.get(url)
      .then((response)=>{
        return (parseInt(response.data)+1).toString();
      });
    }
};

async function isRevealNeeded(address: string, nodeUrl: string, ): Promise<boolean> {
    const Tezos = new TezosToolkit(nodeUrl);
    const manager = await Tezos.rpc.getManagerKey(address);
    const haveManager = manager && typeof manager === 'object' ? !!manager.key : !!manager;
    return !haveManager; 
}

async function getBranch(node_url: string): Promise<string> {
    const Tezos = new TezosToolkit(node_url);
    return await Tezos.rpc.getBlockHash();
}

async function getPubKey(priKey: string, node_url: string = hangzhounet_url): Promise<string> {
    const Tezos = new TezosToolkit(node_url);
    Tezos.setProvider({ signer: await InMemorySigner.fromSecretKey(priKey)});
    return await Tezos.signer.publicKey();
}

async function getPubKeyHash(priKey: string, node_url: string = hangzhounet_url): Promise<string> {
    const Tezos = new TezosToolkit(node_url);
    Tezos.setProvider({ signer: await InMemorySigner.fromSecretKey(priKey)});
    return await Tezos.signer.publicKeyHash();
}

async function forge(tx: any): Promise<string> {
    return await localForger.forge(tx);
}

async function testReveal(testEnv: any, doInject: boolean = false, nodeUrl: string = 'https://hangzhounet.api.tez.ie') {

    const srcAddress = await getPubKeyHash(testEnv.privateKey);
    const srcPubKey = await getPubKey(testEnv.privateKey)

    const reveal = {
        branch: doInject == false ? testEnv.branch : await getBranch(nodeUrl),
        contents:[ 
            { 
                kind: "reveal",
                source: srcAddress,
                fee: testEnv.fee,
                counter: doInject == false ? testEnv.counter : await getCounter(srcAddress, nodeUrl), 
                gas_limit: testEnv.gas_limit,
                storage_limit: testEnv.storage_limit,
                public_key: srcPubKey
            } 
        ]
    }
    
    const forgedOp = await forge(reveal);
    const Tezos = new TezosToolkit(nodeUrl);
    Tezos.setProvider({ signer: await InMemorySigner.fromSecretKey(testEnv.privateKey)});
    const signOp = await Tezos.signer.sign(forgedOp, new Uint8Array([3]));
    console.log('---> Signarue of reveal operation');
    console.log(signOp.sbytes.substring(signOp.sbytes.length - 128));
    console.log('<---');

    if(doInject == true) {
        const doReveal = await isRevealNeeded(srcAddress, nodeUrl);
        if(doReveal == true) {
            console.log('---> Injecting reveal operation to ', nodeUrl);
            const result = await Tezos.rpc.injectOperation(signOp.sbytes);
            console.log('opId: ', result);
        } else {
            console.log("No reveal required!!!");
        }
        console.log('<---')
    }
}

async function testTransaction(testEnv: any, addressType: string = 'tz1', doInject: boolean = false, nodeUrl: string = 'https://hangzhounet.api.tez.ie') {
    
    const srcAddress = await getPubKeyHash(testEnv.privateKey);
 
    let dstAddress: string;
    switch(addressType) {
        default:
        case 'tz1':
            dstAddress = testEnv.tz1Address;
            break;
        case 'tz2':
            dstAddress = testEnv.tz2Address;
            break;
        case 'tz3':
            dstAddress = testEnv.tz3Address;
            break;
        case 'KT1':
            dstAddress = testEnv.KT1Address;
            break;
    }    

    const transaction = { 
        branch: doInject == false ? testEnv.branch : await getBranch(nodeUrl),
        contents:[ 
            { 
                kind: "transaction",
                source: srcAddress, 
                fee: testEnv.fee,
                counter: doInject == false ? testEnv.counter : await getCounter(srcAddress, nodeUrl), 
                gas_limit: testEnv.gas_limit,
                storage_limit: testEnv.storage_limit,
                amount: testEnv.amount,
                destination: dstAddress
             } 
        ]
    }

    const forgedOp = await forge(transaction);
    console.log(forgedOp)
    const Tezos = new TezosToolkit(nodeUrl);
    Tezos.setProvider({ signer: await InMemorySigner.fromSecretKey(testEnv.privateKey)});
    const signOp = await Tezos.signer.sign(forgedOp, new Uint8Array([3]));
    console.log('>--- Signature of transaction operation')
    console.log(signOp.sbytes.substring(signOp.sbytes.length - 128));
    console.log('<---');

    if(doInject == true) {
        const doReveal = await isRevealNeeded(srcAddress, nodeUrl);
        if(doReveal == false) {
            console.log('---> Injecting transaction operation to ', nodeUrl);
            const result = await Tezos.rpc.injectOperation(signOp.sbytes);
            console.log('opId: ', result);
        } else {
            console.log("Do Reveal first!!!");
        }
        console.log('<---')
    }
}

async function testDelegation(testEnv: any, doInject: boolean = false, nodeUrl: string = 'https://hangzhounet.api.tez.ie') {

    const srcAddress = await getPubKeyHash(testEnv.privateKey);

    const delegation = { 
        branch: doInject == false ? testEnv.branch : await getBranch(nodeUrl),
        contents:[ 
            { 
                kind: "delegation",
                source: srcAddress, 
                fee: testEnv.fee,
                counter: doInject == false ? testEnv.counter : await getCounter(srcAddress, nodeUrl), 
                gas_limit: testEnv.gas_limit,
                storage_limit: testEnv.storage_limit,
                delegate: testEnv.baker
            } 
        ]   
    }

    const forgedOp = await forge(delegation);
    const Tezos = new TezosToolkit(nodeUrl);
    Tezos.setProvider({ signer: await InMemorySigner.fromSecretKey(testEnv.privateKey)});
    const signOp = await Tezos.signer.sign(forgedOp, new Uint8Array([3]));
    console.log('>--- Signature of delegation operation')
    console.log(forgedOp);
    console.log('---');
    console.log(signOp);
    console.log(signOp.sbytes.substring(signOp.sbytes.length - 128));
    console.log('<---');

    if(doInject == true) {
        const doReveal = await isRevealNeeded(srcAddress, nodeUrl);
        if(doReveal == false) {
            console.log('---> Injecting delegation operation to ', nodeUrl);
            const result = await Tezos.rpc.injectOperation(signOp.sbytes);
            console.log('opId: ', result);
        } else {
            console.log("Do Reveal first!!!");
        }
        console.log('<---')
    }
}

async function testUndelegation(testEnv: any, doInject: boolean = false, nodeUrl: string = 'https://hangzhounet.api.tez.ie') {
   
    const srcAddress = await getPubKeyHash(testEnv.privateKey);

    const undelegation = { 
        branch: doInject == false ? testEnv.branch : await getBranch(nodeUrl),
        contents:[ 
            { 
                kind: "delegation",
                source: srcAddress, 
                fee: testEnv.fee,
                counter: doInject == false ? testEnv.counter : await getCounter(srcAddress, nodeUrl), 
                gas_limit: testEnv.gas_limit,
                storage_limit: testEnv.storage_limit,
            } 
        ]   
    }
        
    const forgedOp = await forge(undelegation);
    const Tezos = new TezosToolkit(nodeUrl);
    Tezos.setProvider({ signer: await InMemorySigner.fromSecretKey(testEnv.privateKey)});
    const signOp = await Tezos.signer.sign(forgedOp, new Uint8Array([3]));
    console.log('>--- Signature of undelegation operation')
    console.log(signOp.sbytes.substring(signOp.sbytes.length - 128));
    console.log('<---');

    if(doInject == true) {
        const doReveal = await isRevealNeeded(srcAddress, nodeUrl);
        if(doReveal == false) {
            console.log('---> Injecting undelegation operation to ', nodeUrl);
            const result = await Tezos.rpc.injectOperation(signOp.sbytes);
            console.log('opId: ', result);
        } else {
            console.log("Do Reveal first!!!");
        }
        console.log('<---')
    }
}

async function addressToHex(address: string) {
    const hex = await getCodec(CODEC.ADDRESS).encoder(address);
    console.log(hex);
}

function generateExpectedResult() {
    testReveal(testScriptEnv, false);
    testTransaction(testScriptEnv, 'tz1', false);
    testTransaction(testScriptEnv, 'tz2', false);
    testTransaction(testScriptEnv, 'tz3', false);
    testTransaction(testScriptEnv, 'KT1', false);
    testDelegation(testScriptEnv, false);
    testUndelegation(testScriptEnv, false);
}

generateExpectedResult();