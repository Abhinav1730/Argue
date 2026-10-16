export class SessionGuard {
  private epoch = 0;
  private active = false;
  begin() {
    this.active = true;
    return ++this.epoch;
  }
  end() {
    this.active = false;
    this.epoch++;
  }
  current(epoch: number) {
    return this.active && this.epoch === epoch;
  }
  currentValue() {
    return this.epoch;
  }
}
export class RecognitionPolicy {
  private attempt = 0;
  private denied = false;
  nextDelay() {
    return this.denied || this.attempt >= 3 ? null : 500 * 2 ** this.attempt++;
  }
  deny() {
    this.denied = true;
  }
  reset() {
    this.attempt = 0;
  }
}
