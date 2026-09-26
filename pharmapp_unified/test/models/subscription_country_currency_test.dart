import 'package:flutter_test/flutter_test.dart';
import 'package:pharmapp_unified/models/subscription.dart';

void main() {
  test('subscription tariffs stay in the selected country currency', () {
    expect(
      Subscription.getPlanPrice(
        SubscriptionPlan.basic,
        currencyCode: 'GHS',
      ),
      50,
    );
    expect(
      Subscription.getPlanPrice(
        SubscriptionPlan.basic,
        currencyCode: 'XAF',
      ),
      6000,
    );
  });

  test('unconfigured currency cannot fall back to XAF pricing', () {
    expect(Subscription.hasPlanPrices('EUR'), isFalse);
    expect(
      () => Subscription.getPlanPrice(
        SubscriptionPlan.basic,
        currencyCode: 'EUR',
      ),
      throwsStateError,
    );
  });
}
