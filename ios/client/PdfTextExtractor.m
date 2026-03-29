#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(PdfTextExtractor, NSObject)

RCT_EXTERN_METHOD(extractText:(NSString *)filePathOrUri
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(extractPages:(NSString *)filePathOrUri
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
