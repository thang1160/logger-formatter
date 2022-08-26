import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { Formatter } from '../../formatter';

suite('Formatter Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');
	const formatter = new Formatter();

	test('Test isLogger', () => {
		const testCases = [
			'logger.info("job id:" + String.valueOf(jobId));',
			'logger.info("job id:" + String.valueOf(jobId) + " is running");',
		];
		for (const testCase of testCases) {
			// @ts-expect-error
			assert.strictEqual(formatter.isLogger(testCase), true);
		}
	});

	test('Test standardizeMessage', () => {
		const testCases = [
			{ inputMessage: '"job id:" + jobId', expectedMessage: '"job id:{0}"', expectedParams: ['jobId'] },
			{ inputMessage: '"job id:"+jobId', expectedMessage: '"job id:{0}"', expectedParams: ['jobId'] },
			{ inputMessage: '"job id:" +jobId', expectedMessage: '"job id:{0}"', expectedParams: ['jobId'] },
			{ inputMessage: '"job id:"+ jobId', expectedMessage: '"job id:{0}"', expectedParams: ['jobId'] },
			{ inputMessage: '"job id:" + jobId + " is running"', expectedMessage: '"job id:{0} is running"', expectedParams: ['jobId'] },
			{ inputMessage: 'jobId + "job id:"', expectedMessage: '"{0}job id:"', expectedParams: ['jobId'] },
			{ inputMessage: 'jobId+"job id:"', expectedMessage: '"{0}job id:"', expectedParams: ['jobId'] },
			{ inputMessage: 'jobId+ "job id:"', expectedMessage: '"{0}job id:"', expectedParams: ['jobId'] },
			{ inputMessage: 'jobId +"job id:"', expectedMessage: '"{0}job id:"', expectedParams: ['jobId'] },
			{ inputMessage: 'jobId1 + ":testing:" + jobId2', expectedMessage: '"{0}:testing:{1}"', expectedParams: ['jobId1', 'jobId2'] },
		];
		console.log(`testCases.length: ${testCases.length}`);
		for (const testCase of testCases) {
			const { inputMessage, expectedMessage, expectedParams } = testCase;
			const { message, params } = formatter.standardizeMessage(inputMessage);
			assert.strictEqual(message, expectedMessage);
			assert.deepStrictEqual(params, expectedParams);
		}
	});
});
