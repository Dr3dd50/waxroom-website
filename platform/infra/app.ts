// The Wax Room on AWS (CDK). Deploy:
//   npm run build && npm run build:dashboard        # or build:native for our own booking
//   npx cdk deploy -c domain=waxroomrichmond.com [-c hostedZoneId=Z123…] [-c attachDomains=true]
// See platform/infra/README.md for the cutover from the current site.
import { App } from 'aws-cdk-lib';
import { WaxRoomStack } from './stack';

const app = new App();
new WaxRoomStack(app, 'WaxRoom', {
  // CloudFront certificates must live in us-east-1, so the whole stack does.
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: 'us-east-1' },
  domain: app.node.tryGetContext('domain') ?? 'waxroomrichmond.com',
  hostedZoneId: app.node.tryGetContext('hostedZoneId'),
  certificateArn: app.node.tryGetContext('certificateArn'),
  attachDomains: app.node.tryGetContext('attachDomains') === 'true',
});
