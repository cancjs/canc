// Angular test environment on plain ts-jest (no jest-preset-angular): the examples npm root runs a
// single jest 30 binary, and the jest-preset-angular line still peers jest 29, so this example wires
// the Angular JIT test environment directly. zone.js/testing provides the fake-async + change
// detection zone; the dynamic platform gives TestBed a JIT compiler for the standalone components.

import 'zone.js';
import 'zone.js/testing';
import { getTestBed } from '@angular/core/testing';
import { BrowserDynamicTestingModule, platformBrowserDynamicTesting } from '@angular/platform-browser-dynamic/testing';

getTestBed().initTestEnvironment(BrowserDynamicTestingModule, platformBrowserDynamicTesting());
